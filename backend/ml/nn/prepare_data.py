"""
Шаг 1. Готовит датасет миссенс-мутаций из ClinVar.
Вход:  data/variant_summary.txt.gz  (скачать с сайта ClinVar)
Выход: data/missense.csv  (колонки: gene, ref, alt, pos, label)
Запуск: python prepare_data.py
"""
import re
from pathlib import Path

import pandas as pd

SRC = Path("../../../data/variant_summary.txt.gz")
OUT = Path("data/missense.csv")
PAIR_LIMIT = 3000  # максимум примеров на одну пару аминокислот (как в вашем лучшем запуске)

THREE_TO_ONE = {
    "Ala": "A", "Arg": "R", "Asn": "N", "Asp": "D", "Cys": "C",
    "Gln": "Q", "Glu": "E", "Gly": "G", "His": "H", "Ile": "I",
    "Leu": "L", "Lys": "K", "Met": "M", "Phe": "F", "Pro": "P",
    "Ser": "S", "Thr": "T", "Trp": "W", "Tyr": "Y", "Val": "V",
}
# Ищем в названии варианта белковую замену вида (p.Arg123Trp)
P_RE = re.compile(r"\(p\.([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2})\)")

PATHOGENIC = {"Pathogenic", "Likely pathogenic", "Pathogenic/Likely pathogenic"}
BENIGN = {"Benign", "Likely benign", "Benign/Likely benign"}


def main():
    if not SRC.exists():
        raise SystemExit(f"Нет файла {SRC}. Скачайте variant_summary.txt.gz и положите в папку data/")

    header = pd.read_csv(SRC, sep="\t", nrows=0).columns
    # В новых версиях ClinVar колонка может называться по-другому
    sig_col = "ClinicalSignificance" if "ClinicalSignificance" in header else "GermlineClassification"
    cols = ["VariationID", "Type", "Name", "GeneSymbol", sig_col, "Assembly"]

    parts = []
    # Файл большой, поэтому читаем кусками по 200 тысяч строк, чтобы хватило памяти
    for i, chunk in enumerate(pd.read_csv(SRC, sep="\t", usecols=cols, dtype=str, chunksize=200_000)):
        chunk = chunk[(chunk["Type"] == "single nucleotide variant") & (chunk["Assembly"] == "GRCh38")]
        sig = chunk[sig_col]
        chunk = chunk[sig.isin(PATHOGENIC | BENIGN)].copy()
        chunk["label"] = chunk[sig_col].isin(PATHOGENIC).astype(int)

        m = chunk["Name"].str.extract(P_RE)
        chunk["ref"] = m[0].map(THREE_TO_ONE)
        chunk["pos"] = pd.to_numeric(m[1], errors="coerce")
        chunk["alt"] = m[2].map(THREE_TO_ONE)  # стоп-кодон Ter сюда не попадёт
        chunk = chunk.dropna(subset=["ref", "alt", "pos"])
        chunk = chunk[chunk["ref"] != chunk["alt"]]
        parts.append(chunk[["VariationID", "GeneSymbol", "ref", "alt", "pos", "label"]])
        print(f"кусок {i + 1}: найдено {len(chunk)} миссенс-вариантов")

    df = pd.concat(parts, ignore_index=True)
    df = df.drop_duplicates("VariationID")
    df = df[~df["GeneSymbol"].str.contains(";|-", na=True)]  # убираем варианты сразу в нескольких генах
    df = df.rename(columns={"GeneSymbol": "gene"})

    # Ограничение на пару аминокислот, чтобы частые пары не задавили редкие
    df = df.sample(frac=1, random_state=42).groupby(["ref", "alt"]).head(PAIR_LIMIT)

    df["pos"] = df["pos"].astype(int)
    df[["gene", "ref", "alt", "pos", "label"]].to_csv(OUT, index=False)
    print(f"\nГотово: {len(df)} вариантов, {df['gene'].nunique()} генов, "
          f"патогенных {df['label'].mean():.1%}. Сохранено в {OUT}")


if __name__ == "__main__":
    main()
