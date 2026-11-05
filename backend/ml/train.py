"""Обучение учебной модели: оценка вероятности патогенности миссенс-замены (версия 3).

Что делает скрипт:
  1. читает ClinVar, оставляет миссенс-варианты с понятной классификацией;
  2. ограничивает вклад отдельных генов и замен, чтобы данные не были перекошены;
  3. сравнивает три набора признаков (base, extended, full) и три типа моделей
     кросс-валидацией по генам (абляция: что реально даёт прирост);
  4. выбирает самую простую модель среди равных по качеству;
  5. оценивает её на генах, которых модель не видела, с доверительным интервалом;
  6. сохраняет две модели: с контекстом нуклеотидной замены и только по аминокислотам.

Запуск из папки backend:
    python -m ml.train ..\\data\\variant_summary.txt.gz
Полезные параметры:
    --min-review multiple   брать только варианты с несколькими подтверждениями или экспертной оценкой
    --strict-labels         брать только Pathogenic и Benign (без Likely)
    --max-per-pair 3000     ограничение примеров на пару аминокислот (по классу)
    --max-per-gene 300      ограничение примеров на ген (по классу)
    --suffix _v3            суффикс имён файлов результата
"""
import argparse
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

from .features import FEATURE_GROUPS, features

OUT_DIR = Path(__file__).resolve().parent
SEED = 42
DEFAULT_MAX_GENE = 300
DEFAULT_MAX_PAIR = 3000

THREE = {
    "Ala": "A", "Arg": "R", "Asn": "N", "Asp": "D", "Cys": "C", "Gln": "Q",
    "Glu": "E", "Gly": "G", "His": "H", "Ile": "I", "Leu": "L", "Lys": "K",
    "Met": "M", "Phe": "F", "Pro": "P", "Ser": "S", "Thr": "T", "Trp": "W",
    "Tyr": "Y", "Val": "V",
}

PATHOGENIC = {"pathogenic", "likely pathogenic", "pathogenic/likely pathogenic"}
BENIGN = {"benign", "likely benign", "benign/likely benign"}
STRICT = {"pathogenic", "benign"}

REQUIRED = ["Type", "Name", "GeneSymbol", "ClinicalSignificance", "ReviewStatus", "Assembly"]

GROUPS = ["base", "extended", "full"]  # от простого к сложному
KINDS = ["logreg", "boost_d3_n150", "boost_d4_n300"]


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
        keep = ~review.str.startswith("no ")
        chunk, review = chunk[keep], review[keep]

        sig = chunk["ClinicalSignificance"].fillna("").str.lower().str.strip()
        label = pd.Series(np.nan, index=chunk.index)
        label[sig.isin(PATHOGENIC)] = 1
        label[sig.isin(BENIGN)] = 0

        prot = chunk["Name"].str.extract(r"\(p\.([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2})\)")
        cdna = chunk["Name"].str.extract(r"c\.(\d+)([ACGT])>([ACGT])")

        frame = pd.DataFrame({
            "gene": chunk["GeneSymbol"],
            "ref3": prot[0], "ppos": prot[1], "alt3": prot[2],
            "cpos": cdna[0], "nt_ref": cdna[1], "nt_alt": cdna[2],
            "label": label,
            "strict": sig.isin(STRICT),
            "multi": review.str.contains("multiple submitters|expert panel|practice guideline"),
        }).dropna(subset=["label", "ref3", "ppos", "alt3", "cpos", "nt_ref", "nt_alt", "gene"])

        frame = frame[frame["ref3"].isin(THREE) & frame["alt3"].isin(THREE) & (frame["ref3"] != frame["alt3"])].copy()
        frame["ppos"] = frame["ppos"].astype(int)
        frame["cpos"] = frame["cpos"].astype(int)
        # исключаем потерю старт-кодона и записи, где нумерации кДНК и белка не согласуются
        frame = frame[(frame["ppos"] > 1) & ((frame["cpos"] - 1) // 3 + 1 == frame["ppos"])]

        parts.append(pd.DataFrame({
            "gene": frame["gene"],
            "pos": frame["ppos"],
            "ref": frame["ref3"].map(THREE),
            "alt": frame["alt3"].map(THREE),
            "nt_ref": frame["nt_ref"],
            "nt_alt": frame["nt_alt"],
            "codon_pos": (frame["cpos"] - 1) % 3 + 1,
            "label": frame["label"].astype(int),
            "strict": frame["strict"].astype(int),
            "multi": frame["multi"].astype(int),
        }))

    if not parts:
        raise SystemExit("Не найдено ни одной подходящей записи. Проверьте файл.")
    df = pd.concat(parts, ignore_index=True)
    return df.drop_duplicates(["gene", "pos", "ref", "alt", "nt_ref", "nt_alt"]).reset_index(drop=True)


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

def make_model(kind: str):
    if kind == "logreg":
        return make_pipeline(
            StandardScaler(),
            LogisticRegression(C=0.3, class_weight="balanced", max_iter=3000),
        )
    depth, iters = {"boost_d3_n150": (3, 150), "boost_d4_n300": (4, 300)}[kind]
    return HistGradientBoostingClassifier(
        max_depth=depth, max_iter=iters, learning_rate=0.05,
        min_samples_leaf=50, l2_regularization=1.0,
        class_weight="balanced", early_stopping=False, random_state=SEED,
    )


def make_blosum_baseline():
    """Базовая модель: только оценка BLOSUM62 (первый столбец)."""
    return make_pipeline(
        ColumnTransformer([("blosum", StandardScaler(), [0])]),
        LogisticRegression(class_weight="balanced", max_iter=1000),
    )


def cv_scores(model, X, y, groups, k=5) -> np.ndarray:
    """ROC AUC по фолдам, где гены в обучающей и проверочной частях не пересекаются."""
    scores = []
    for tr, va in GroupKFold(n_splits=k).split(X, y, groups):
        m = clone(model).fit(X[tr], y[tr])
        scores.append(roc_auc_score(y[va], m.predict_proba(X[va])[:, 1]))
    return np.array(scores)


def pick_simplest_within_se(results: list) -> int:
    """Правило одной стандартной ошибки: самая простая модель, не хуже лучшей с учётом ошибки."""
    best = int(np.argmax([r["cv_mean"] for r in results]))
    threshold = results[best]["cv_mean"] - results[best]["cv_se"]
    for i, r in enumerate(results):  # список упорядочен от простых к сложным
        if r["cv_mean"] >= threshold:
            return i
    return best


def evaluate(y, proba) -> dict:
    pred = (proba >= 0.5).astype(int)
    return {
        "roc_auc": round(float(roc_auc_score(y, proba)), 3),
        "pr_auc": round(float(average_precision_score(y, proba)), 3),
        "balanced_accuracy": round(float(balanced_accuracy_score(y, pred)), 3),
        "f1": round(float(f1_score(y, pred)), 3),
        "brier": round(float(brier_score_loss(y, proba)), 3),
        "confusion_matrix": confusion_matrix(y, pred).tolist(),
    }


def bootstrap_auc(y, proba, genes, n=200) -> list:
    """95% доверительный интервал ROC AUC: гены перевыбираются с возвращением."""
    rng = np.random.default_rng(SEED)
    _, gene_idx = np.unique(genes, return_inverse=True)
    n_genes = gene_idx.max() + 1
    scores = []
    for _ in range(n):
        counts = np.bincount(rng.integers(0, n_genes, n_genes), minlength=n_genes)
        weights = counts[gene_idx]
        if len(np.unique(y[weights > 0])) < 2:
            continue
        scores.append(roc_auc_score(y, proba, sample_weight=weights))
    return [round(float(np.percentile(scores, 2.5)), 3), round(float(np.percentile(scores, 97.5)), 3)]


def unseen_pairs_test(df, X, y, cols, specs, rng) -> dict:
    """Модели обучаются без части замен целиком и проверяются на них:
    показывает, учат ли они свойства аминокислот или запоминают пары."""
    pairs = df[["ref", "alt"]].drop_duplicates().reset_index(drop=True)
    held = pairs.sample(frac=0.2, random_state=int(rng.integers(0, 10_000)))
    held_set = set(zip(held.ref, held.alt))
    is_held = np.array([(r, a) in held_set for r, a in zip(df.ref, df.alt)])
    if is_held.sum() < 30 or (~is_held).sum() < 30 or len(set(y[is_held])) < 2:
        return {"note": "слишком мало данных для этой проверки"}
    out = {"held_out_pairs": int(len(held)), "test_rows": int(is_held.sum())}
    for name, (group, kind) in specs.items():
        model = make_blosum_baseline() if kind == "baseline" else make_model(kind)
        sl = cols["base"] if kind == "baseline" else cols[group]
        m = clone(model).fit(X[~is_held][:, sl], y[~is_held])
        out[name + "_roc_auc"] = round(float(roc_auc_score(y[is_held], m.predict_proba(X[is_held][:, sl])[:, 1])), 3)
    return out


# ---------- основной сценарий ----------

def main(path, max_gene=DEFAULT_MAX_GENE, max_pair=DEFAULT_MAX_PAIR, suffix="",
         use_cache=True, strict_labels=False, min_review="any"):
    rng = np.random.default_rng(SEED)

    cache = Path(path).resolve().parent / "clinvar_missense_cache_v3.csv"
    if use_cache and cache.exists():
        print(f"Читаю подготовленные данные из кеша: {cache.name}")
        raw = pd.read_csv(cache, keep_default_na=False)
    else:
        print("Читаю и фильтрую данные ClinVar (это может занять несколько минут)...")
        raw = load_clinvar(path)
        if use_cache:
            raw.to_csv(cache, index=False)

    if strict_labels:
        raw = raw[raw["strict"] == 1]
    if min_review == "multiple":
        raw = raw[raw["multi"] == 1]
    raw = raw.reset_index(drop=True)
    print(f"Параметры: на ген {max_gene}, на пару {max_pair}, строгие метки: {strict_labels}, уровень подтверждения: {min_review}")

    before = concentration(raw)
    print("До ограничений:", before)
    df = cap_data(raw, max_gene, max_pair)
    after = concentration(df)
    n_path, n_ben = int((df.label == 1).sum()), int((df.label == 0).sum())
    print("После ограничений:", after)
    print(f"Классы: патогенных {n_path}, доброкачественных {n_ben}")

    X = np.array(
        [features(r, a, "full", nr, na, cp) for r, a, nr, na, cp in zip(df.ref, df.alt, df.nt_ref, df.nt_alt, df.codon_pos)],
        dtype=float,
    )
    y = df.label.values
    genes = df.gene.values
    cols = {g: slice(0, len(FEATURE_GROUPS[g])) for g in GROUPS}

    splitter = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=SEED)
    tr_idx, te_idx = next(splitter.split(X, y, genes))
    X_tr, X_te, y_tr, y_te = X[tr_idx], X[te_idx], y[tr_idx], y[te_idx]
    g_tr, g_te = genes[tr_idx], genes[te_idx]

    # абляция: все наборы признаков и модели, кросс-валидация по генам только на обучающей части
    results = []
    print("\nКросс-валидация по генам (ROC AUC):")
    for group in GROUPS:
        for kind in KINDS:
            s = cv_scores(make_model(kind), X_tr[:, cols[group]], y_tr, g_tr)
            results.append({
                "features": group, "model": kind, "n_features": len(FEATURE_GROUPS[group]),
                "cv_mean": round(float(s.mean()), 3), "cv_std": round(float(s.std()), 3),
                "cv_se": float(s.std() / np.sqrt(len(s))),
            })
            print(f"  {group:<9} {kind:<14} {s.mean():.3f} ± {s.std():.3f}")

    chosen = pick_simplest_within_se(results)
    sel = results[chosen]
    print(f"\nВыбрано: признаки «{sel['features']}», модель {sel['model']} (самая простая из равных по качеству)")

    # оценка на тестовых генах: выбранная модель, прошлая версия и базовая модель
    def fit_predict(group, kind):
        sl = cols[group]
        m = clone(make_model(kind)).fit(X_tr[:, sl], y_tr)
        return m, m.predict_proba(X_te[:, sl])[:, 1], m.predict_proba(X_tr[:, sl])[:, 1]

    sel_model, sel_proba, sel_train_proba = fit_predict(sel["features"], sel["model"])
    _, v2_proba, _ = fit_predict("base", "boost_d3_n150")
    blosum = make_blosum_baseline().fit(X_tr, y_tr)
    base_proba = blosum.predict_proba(X_te)[:, 1]

    test_m = evaluate(y_te, sel_proba)
    test_m["roc_auc_ci95"] = bootstrap_auc(y_te, sel_proba, g_te)
    v2_m = evaluate(y_te, v2_proba)
    v2_m["roc_auc_ci95"] = bootstrap_auc(y_te, v2_proba, g_te)
    base_m = evaluate(y_te, base_proba)
    train_auc = round(float(roc_auc_score(y_tr, sel_train_proba)), 3)
    gap = round(train_auc - test_m["roc_auc"], 3)

    print("\nТест на новых генах:")
    print(f"  выбранная модель        ROC AUC {test_m['roc_auc']}  (95% ДИ {test_m['roc_auc_ci95']})")
    print(f"  прошлая версия (base)   ROC AUC {v2_m['roc_auc']}  (95% ДИ {v2_m['roc_auc_ci95']})")
    print(f"  только BLOSUM62         ROC AUC {base_m['roc_auc']}")
    print(f"  обучение {train_auc}, тест {test_m['roc_auc']}, разрыв {gap}")
    print(f"  матрица ошибок выбранной модели: {test_m['confusion_matrix']}")

    imp = permutation_importance(
        sel_model, X_te[:, cols[sel["features"]]], y_te, scoring="roc_auc", n_repeats=3, random_state=SEED
    )
    names = FEATURE_GROUPS[sel["features"]]
    order = np.argsort(imp.importances_mean)[::-1][:10]
    importance = [{"feature": names[i], "drop_in_auc": round(float(imp.importances_mean[i]), 4)} for i in order]
    print("Самые важные признаки:", [(d["feature"], d["drop_in_auc"]) for d in importance[:5]])

    unseen = unseen_pairs_test(
        df, X, y, cols,
        {"blosum_only": ("base", "baseline"), "previous_version": ("base", "boost_d3_n150"),
         "selected": (sel["features"], sel["model"])},
        rng,
    )
    print("Проверка на новых заменах:", unseen)

    # итоговые модели на всех данных: с контекстом нуклеотидов и только по аминокислотам
    aa_candidates = [r for r in results if r["features"] != "full"]
    aa_sel = aa_candidates[pick_simplest_within_se(aa_candidates)]
    final_full = clone(make_model(sel["model"])).fit(X[:, cols[sel["features"]]], y)
    if sel["features"] == "full":
        final_aa = clone(make_model(aa_sel["model"])).fit(X[:, cols[aa_sel["features"]]], y)
        aa_group, aa_kind = aa_sel["features"], aa_sel["model"]
    else:
        final_aa, aa_group, aa_kind = final_full, sel["features"], sel["model"]

    bundle = {
        "version": 3,
        "models": {
            "full": {"estimator": final_full, "group": sel["features"], "kind": sel["model"]},
            "aa": {"estimator": final_aa, "group": aa_group, "kind": aa_kind},
        },
    }
    model_file = OUT_DIR / f"variant_model{suffix}.joblib"
    metrics_file = OUT_DIR / f"metrics{suffix}.json"
    joblib.dump(bundle, model_file)

    report = {
        "options": {"max_per_gene": max_gene, "max_per_pair": max_pair,
                    "strict_labels": strict_labels, "min_review": min_review},
        "data_before_limits": before, "data_after_limits": after,
        "class_counts": {"pathogenic": n_path, "benign": n_ben},
        "ablation_cv_by_gene": [{k: v for k, v in r.items() if k != "cv_se"} for r in results],
        "selected": {"features": sel["features"], "model": sel["model"]},
        "deployed_models": {"with_nucleotide_context": [sel["features"], sel["model"]],
                            "amino_acids_only": [aa_group, aa_kind]},
        "train_roc_auc": train_auc, "overfit_gap": gap,
        "test_metrics_new_genes": test_m,
        "previous_version_test": v2_m,
        "baseline_blosum_test": base_m,
        "unseen_pairs_test": unseen,
        "permutation_importance_top": importance,
        "notes": "Тест и кросс-валидация делятся по генам, ограничения применяются до разбиения.",
    }
    metrics_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nГотово: сохранены ml/{model_file.name} и ml/{metrics_file.name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Обучение учебной модели патогенности миссенс-замен")
    parser.add_argument("path", help="путь к variant_summary.txt.gz")
    parser.add_argument("--max-per-gene", type=int, default=DEFAULT_MAX_GENE)
    parser.add_argument("--max-per-pair", type=int, default=DEFAULT_MAX_PAIR)
    parser.add_argument("--suffix", default="", help="суффикс имён файлов результата, например _v3")
    parser.add_argument("--no-cache", action="store_true", help="не использовать кеш подготовленных данных")
    parser.add_argument("--strict-labels", action="store_true", help="только Pathogenic и Benign, без Likely")
    parser.add_argument("--min-review", choices=["any", "multiple"], default="any",
                        help="multiple: только варианты с несколькими подтверждениями или экспертной оценкой")
    args = parser.parse_args()
    main(args.path, args.max_per_gene, args.max_per_pair, args.suffix,
         not args.no_cache, args.strict_labels, args.min_review)
