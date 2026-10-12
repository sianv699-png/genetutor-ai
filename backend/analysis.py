from Bio.Seq import Seq

VALID_DNA = set("ATGCN")


def clean_sequence(raw: str) -> str:
    """Убирает FASTA-заголовок (строку с >), пробелы и переносы строк."""
    lines = [l.strip() for l in raw.strip().splitlines() if l.strip() and not l.startswith(">")]
    return "".join(lines).upper().replace("U", "T")


def validate(seq: str):
    """Возвращает текст ошибки или None, если последовательность корректна."""
    if not seq:
        return "Последовательность пустая"
    bad = sorted(set(seq) - VALID_DNA)
    if bad:
        return "Недопустимые символы: " + ", ".join(bad) + ". Разрешены A, T, G, C (и N)."
    if len(seq) > 20000:
        return "Последовательность слишком длинная (максимум 20 000 нуклеотидов)"
    return None


def basic_stats(seq: str) -> dict:
    counts = {n: seq.count(n) for n in "ATGC"}
    gc = (counts["G"] + counts["C"]) / len(seq) * 100
    return {
        "length": len(seq),
        "counts": counts,
        "gc_percent": round(gc, 2),
        "rna": seq.replace("T", "U"),
        "protein": str(Seq(seq[: len(seq) // 3 * 3]).translate()),
    }


def find_mutations(ref: str, sample: str) -> list:
    """Сравнивает две последовательности одинаковой длины (точечные замены)."""
    mutations = []
    for i, (r, s) in enumerate(zip(ref, sample)):
        if r == s:
            continue
        m = {"position": i + 1, "ref": r, "alt": s}
        codon_start = i // 3 * 3
        ref_codon = ref[codon_start: codon_start + 3]
        alt_codon = sample[codon_start: codon_start + 3]
        if len(ref_codon) == 3 and "N" not in ref_codon + alt_codon:
            ref_aa = str(Seq(ref_codon).translate())
            alt_aa = str(Seq(alt_codon).translate())
            m.update({
                "codon_number": codon_start // 3 + 1,
                "ref_codon": ref_codon,
                "alt_codon": alt_codon,
                "ref_aa": ref_aa,
                "alt_aa": alt_aa,
            })
            if ref_aa == alt_aa:
                m["effect"] = "синонимичная"
            elif alt_aa == "*":
                m["effect"] = "нонсенс (стоп-кодон)"
            elif ref_aa == "*":
                m["effect"] = "потеря стоп-кодона"
            else:
                m["effect"] = "миссенс (замена аминокислоты)"
        mutations.append(m)
    return mutations