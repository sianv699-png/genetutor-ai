"""Обучение учебной модели: оценка вероятности патогенности миссенс-замены.

Версия с защитой от переобучения и от «зацикливания» на нескольких заменах.

Запуск из папки backend:
    python -m ml.train путь/к/variant_summary.txt.gz
"""
import argparse
import sys
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score, balanced_accuracy_score, brier_score_loss,
    confusion_matrix, f1_score, roc_auc_score,
)
from sklearn.model_selection import GroupKFold, GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .features import FEATURE_NAMES, pair_features

OUT_DIR = Path(__file__).resolve().parent
SEED = 42

# ограничения, чтобы несколько генов и несколько замен не доминировали в данных
MAX_PER_GENE = 300   # максимум примеров одного класса из одного гена
MAX_PER_PAIR = 800   # максимум примеров одного класса на одну пару аминокислот

THREE = {
    "Ala": "A", "Arg": "R", "Asn": "N", "Asp": "D", "Cys": "C", "Gln": "Q",
    "Glu": "E", "Gly": "G", "His": "H", "Ile": "I", "Leu": "L", "Lys": "K",
    "Met": "M", "Phe": "F", "Pro": "P", "Ser": "S", "Thr": "T", "Trp": "W",
    "Tyr": "Y", "Val": "V",
}

PATHOGENIC = {"pathogenic", "likely pathogenic", "pathogenic/likely pathogenic"}
BENIGN = {"benign", "likely benign", "benign/likely benign"}

REQUIRED = ["Type", "Name", "GeneSymbol", "ClinicalSignificance", "ReviewStatus", "Assembly"]


# ---------- загрузка данных ----------

def load_clinvar(path: str) -> pd.DataFrame:
    header = pd.read_csv(path, sep="\t", compression="infer", nrows=0)
    missing = [c for c in REQUIRED if c not in header.columns]
    if missing:
        raise SystemExit(
            f"В файле нет столбцов: {missing}\nДоступные столбцы: {list(header.columns)}"
        )

    parts = []
    reader = pd.read_csv(
        path, sep="\t", compression="infer", usecols=REQUIRED,
        chunksize=200_000, low_memory=False,
    )
    for chunk in reader:
        chunk = chunk[(chunk["Type"] == "single nucleotide variant") & (chunk["Assembly"] == "GRCh38")]
        review = chunk["ReviewStatus"].fillna("").str.lower()
        chunk = chunk[~review.str.startswith("no ")]

        sig = chunk["ClinicalSignificance"].fillna("").str.lower().str.strip()
        label = pd.Series(np.nan, index=chunk.index)
        label[sig.isin(PATHOGENIC)] = 1
        label[sig.isin(BENIGN)] = 0
        chunk = chunk.assign(label=label).dropna(subset=["label"])

        ext = chunk["Name"].str.extract(r"\(p\.([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2})\)")
        chunk = chunk.assign(ref3=ext[0], pos=ext[1], alt3=ext[2]).dropna(subset=["ref3", "pos", "alt3"])
        chunk = chunk[chunk["ref3"].isin(THREE) & chunk["alt3"].isin(THREE)]
        chunk = chunk[chunk["ref3"] != chunk["alt3"]]
        chunk["pos"] = chunk["pos"].astype(int)
        chunk = chunk[chunk["pos"] > 1]  # исключаем потерю старт-кодона

        parts.append(pd.DataFrame({
            "gene": chunk["GeneSymbol"],
            "pos": chunk["pos"],
            "ref": chunk["ref3"].map(THREE),
            "alt": chunk["alt3"].map(THREE),
            "label": chunk["label"].astype(int),
        }))

    if not parts:
        raise SystemExit("Не найдено ни одной подходящей записи. Проверьте файл.")
    df = pd.concat(parts, ignore_index=True)
    return df.drop_duplicates(["gene", "pos", "ref", "alt"]).reset_index(drop=True)


# ---------- борьба с перекосом данных ----------

def concentration(df: pd.DataFrame) -> dict:
    """Насколько данные «собраны» вокруг нескольких замен и генов."""
    pair_sizes = df.groupby(["ref", "alt"]).size().sort_values(ascending=False)
    gene_sizes = df.groupby("gene").size().sort_values(ascending=False)
    return {
        "rows": int(len(df)),
        "distinct_pairs": int(len(pair_sizes)),
        "share_top5_pairs": round(float(pair_sizes.head(5).sum() / len(df)), 3),
        "distinct_genes": int(len(gene_sizes)),
        "share_top5_genes": round(float(gene_sizes.head(5).sum() / len(df)), 3),
    }


def cap_data(df: pd.DataFrame, max_gene: int, max_pair: int) -> pd.DataFrame:
    """Ограничивает вклад одного гена и одной пары аминокислот (отдельно по каждому классу)."""
    shuffled = df.sample(frac=1, random_state=SEED)
    shuffled = shuffled.groupby(["gene", "label"]).head(max_gene)
    shuffled = shuffled.groupby(["ref", "alt", "label"]).head(max_pair)
    return shuffled.reset_index(drop=True)


# ---------- модели ----------

def make_candidates() -> list:
    """Кандидаты, от простых к сложным. Простая модель выигрывает при равном качестве."""
    candidates = [
        ("baseline_blosum", make_pipeline(
            ColumnTransformer([("blosum", StandardScaler(), [0])]),
            LogisticRegression(class_weight="balanced", max_iter=1000),
        )),
        ("logreg_all_features", make_pipeline(
            StandardScaler(),
            LogisticRegression(C=0.3, class_weight="balanced", max_iter=2000),
        )),
    ]
    for depth in (2, 3):
        for iters in (60, 150):
            candidates.append((
                f"boosting_d{depth}_n{iters}",
                HistGradientBoostingClassifier(
                    max_depth=depth, max_iter=iters, learning_rate=0.05,
                    min_samples_leaf=50, l2_regularization=1.0,
                    class_weight="balanced", early_stopping=False, random_state=SEED,
                ),
            ))
    return candidates


def cv_scores(model, X, y, groups, k=5) -> np.ndarray:
    """ROC AUC по фолдам, где гены в обучающей и проверочной частях не пересекаются."""
    scores = []
    for tr, va in GroupKFold(n_splits=k).split(X, y, groups):
        m = clone(model).fit(X[tr], y[tr])
        scores.append(roc_auc_score(y[va], m.predict_proba(X[va])[:, 1]))
    return np.array(scores)


def pick_simplest_within_se(results: list) -> int:
    """Правило одной стандартной ошибки: берём самую простую модель, не хуже лучшей по ошибке."""
    means = [r["cv_mean"] for r in results]
    best = int(np.argmax(means))
    threshold = results[best]["cv_mean"] - results[best]["cv_se"]
    for i, r in enumerate(results):  # список упорядочен от простых к сложным
        if r["cv_mean"] >= threshold:
            return i
    return best


def evaluate(model, X, y) -> dict:
    proba = model.predict_proba(X)[:, 1]
    pred = (proba >= 0.5).astype(int)
    return {
        "roc_auc": round(float(roc_auc_score(y, proba)), 3),
        "pr_auc": round(float(average_precision_score(y, proba)), 3),
        "balanced_accuracy": round(float(balanced_accuracy_score(y, pred)), 3),
        "f1": round(float(f1_score(y, pred)), 3),
        "brier": round(float(brier_score_loss(y, proba)), 3),
        "confusion_matrix": confusion_matrix(y, pred).tolist(),
    }


def unseen_pairs_test(df, X, y, template, rng) -> dict:
    """Проверка: модель обучается без части замен целиком и тестируется на них.
    Показывает, учит ли модель свойства аминокислот или просто запоминает пары."""
    pairs = df[["ref", "alt"]].drop_duplicates().reset_index(drop=True)
    held = pairs.sample(frac=0.2, random_state=int(rng.integers(0, 10_000)))
    held_set = set(zip(held.ref, held.alt))
    is_held = np.array([(r, a) in held_set for r, a in zip(df.ref, df.alt)])
    if is_held.sum() < 30 or (~is_held).sum() < 30 or len(set(y[is_held])) < 2:
        return {"note": "слишком мало данных для этой проверки"}
    out = {"held_out_pairs": int(len(held)), "test_rows": int(is_held.sum())}
    for name, mdl in (("baseline_blosum", make_candidates()[0][1]), ("selected", template)):
        m = clone(mdl).fit(X[~is_held], y[~is_held])
        out[name + "_roc_auc"] = round(float(roc_auc_score(y[is_held], m.predict_proba(X[is_held])[:, 1])), 3)
    return out


# ---------- основной сценарий ----------

def main(path: str, max_gene: int = MAX_PER_GENE, max_pair: int = MAX_PER_PAIR,
         suffix: str = "", use_cache: bool = True):
    rng = np.random.default_rng(SEED)

    cache = Path(path).resolve().parent / "clinvar_missense_cache.csv"
    if use_cache and cache.exists():
        print(f"Читаю подготовленные данные из кеша: {cache.name}")
        raw = pd.read_csv(cache, keep_default_na=False)
    else:
        print("Читаю и фильтрую данные ClinVar (это может занять несколько минут)...")
        raw = load_clinvar(path)
        if use_cache:
            raw.to_csv(cache, index=False)
    print(f"Параметры ограничений: максимум на ген {max_gene}, на пару аминокислот {max_pair}")
    before = concentration(raw)
    print("До ограничений:", before)

    df = cap_data(raw, max_gene, max_pair)
    after = concentration(df)
    n_path, n_ben = int((df.label == 1).sum()), int((df.label == 0).sum())
    print("После ограничений:", after)
    print(f"Классы: патогенных {n_path}, доброкачественных {n_ben}")

    X = np.array([pair_features(r, a) for r, a in zip(df.ref, df.alt)])
    y = df.label.values
    groups = df.gene.values

    # финальный тест: гены, которые модель не видела вообще
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=SEED)
    tr_idx, te_idx = next(splitter.split(X, y, groups))
    X_tr, X_te, y_tr, y_te = X[tr_idx], X[te_idx], y[tr_idx], y[te_idx]
    g_tr = groups[tr_idx]

    # подбор модели только на обучающей части, кросс-валидация по генам
    results = []
    for name, model in make_candidates():
        s = cv_scores(model, X_tr, y_tr, g_tr)
        results.append({
            "name": name, "cv_mean": round(float(s.mean()), 3),
            "cv_std": round(float(s.std()), 3), "cv_se": float(s.std() / np.sqrt(len(s))),
        })
        print(f"{name}: ROC AUC по фолдам {s.mean():.3f} ± {s.std():.3f}")

    chosen = pick_simplest_within_se(results)
    chosen_name = results[chosen]["name"]
    template = make_candidates()[chosen][1]
    print("Выбрана модель (самая простая из равных по качеству):", chosen_name)

    # оценка на тесте и признаки переобучения
    model = clone(template).fit(X_tr, y_tr)
    test_m = evaluate(model, X_te, y_te)
    train_auc = round(float(roc_auc_score(y_tr, model.predict_proba(X_tr)[:, 1])), 3)
    gap = round(train_auc - test_m["roc_auc"], 3)
    baseline = make_candidates()[0][1].fit(X_tr, y_tr)
    base_m = evaluate(baseline, X_te, y_te)
    print("Тест (новые гены):", test_m)
    print(f"ROC AUC: обучение {train_auc}, тест {test_m['roc_auc']}, разрыв {gap}")
    print("Базовая модель (только BLOSUM62):", base_m["roc_auc"])

    # какие признаки реально используются
    imp = permutation_importance(model, X_te, y_te, scoring="roc_auc", n_repeats=5, random_state=SEED)
    order = np.argsort(imp.importances_mean)[::-1][:8]
    importance = [{"feature": FEATURE_NAMES[i], "drop_in_auc": round(float(imp.importances_mean[i]), 4)} for i in order]

    # обобщение на замены, которых не было в обучении
    unseen = unseen_pairs_test(df, X, y, template, rng)
    print("Проверка на новых заменах:", unseen)

    # итоговая модель обучается на всех данных после ограничений
    final = clone(template).fit(X, y)
    model_file = OUT_DIR / f"variant_model{suffix}.joblib"
    metrics_file = OUT_DIR / f"metrics{suffix}.json"
    joblib.dump({"model": final, "features": FEATURE_NAMES, "name": chosen_name}, model_file)

    report = {
        "data_before_limits": before, "data_after_limits": after,
        "limits": {"max_per_gene_per_class": max_gene, "max_per_pair_per_class": max_pair},
        "class_counts": {"pathogenic": n_path, "benign": n_ben},
        "cross_validation_by_gene": [{k: v for k, v in r.items() if k != "cv_se"} for r in results],
        "selected_model": chosen_name,
        "train_roc_auc": train_auc, "test_metrics_new_genes": test_m, "overfit_gap": gap,
        "baseline_blosum_test": base_m,
        "unseen_pairs_test": unseen,
        "permutation_importance_top": importance,
        "notes": "Тест и кросс-валидация делятся по генам; признаки считаются только из пары аминокислот.",
    }
    metrics_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Готово: сохранены ml/{model_file.name} и ml/{metrics_file.name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Обучение учебной модели патогенности миссенс-замен")
    parser.add_argument("path", help="путь к variant_summary.txt.gz")
    parser.add_argument("--max-per-gene", type=int, default=MAX_PER_GENE, help="максимум примеров класса из одного гена")
    parser.add_argument("--max-per-pair", type=int, default=MAX_PER_PAIR, help="максимум примеров класса на пару аминокислот")
    parser.add_argument("--suffix", default="", help="суффикс имён файлов результата, например _p800")
    parser.add_argument("--no-cache", action="store_true", help="не использовать кеш подготовленных данных")
    args = parser.parse_args()
    main(args.path, args.max_per_gene, args.max_per_pair, args.suffix, not args.no_cache)
