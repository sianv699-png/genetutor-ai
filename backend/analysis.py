from Bio.Seq import Seq

VALID_DNA = set("ATGCN")

MAX_TEXT_LEN = 20_000         # максимум для текста, вставленного в поле
MAX_FILE_LEN = 1_000_000      # максимум нуклеотидов в загруженном файле
MAX_FILE_BYTES = 2_000_000    # максимальный размер файла, байт
PREVIEW_LEN = 3_000           # сколько нуклеотидов показывать на странице и сохранять в базе
MAX_MUTATIONS = 300           # сколько мутаций показывать
MAX_DIFF_SHARE = 0.10         # длинные последовательности, отличающиеся сильнее, считаем разными генами
MIN_LEN_FOR_DIFF_CHECK = 300  # короткие учебные примеры этой проверкой не ограничиваем


def clean_sequence(raw: str) -> str:
    """Убирает FASTA-заголовок (строку с >), пробелы и переносы строк."""
    lines = [l.strip() for l in raw.strip().splitlines() if l.strip() and not l.strip().startswith(">")]
    return "".join("".join(lines).split()).upper().replace("U", "T")


def validate(seq: str, max_len: int = MAX_TEXT_LEN):
    """Возвращает текст ошибки или None, если последовательность корректна."""
    if not seq:
        return "Последовательность пустая"
    bad = sorted(set(seq) - VALID_DNA)
    if bad:
        shown = ", ".join(bad[:10]) + (" и другие" if len(bad) > 10 else "")
        return "Недопустимые символы: " + shown + ". Разрешены A, T, G, C (и N)."
    if len(seq) > max_len:
        text = f"Последовательность слишком длинная (максимум {max_len:,} нуклеотидов)".replace(",", " ")
        if max_len == MAX_TEXT_LEN:
            text += ". Для длинных последовательностей загрузите файл."
        return text
    return None


def decode_upload(data: bytes) -> str:
    """Байты файла в текст (UTF-8, при ошибке Latin-1)."""
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("latin-1")


def parse_fasta(text: str):
    """Разбирает FASTA (или просто текст с последовательностью).

    Возвращает (последовательность первой записи, сведения о файле).
    Строки, начинающиеся с ;, считаются комментариями."""
    text = text.lstrip("\ufeff")
    records = []
    header, lines = None, []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(";"):
            continue
        if line.startswith(">"):
            if lines or header is not None:
                records.append((header, lines))
            header, lines = line[1:].strip(), []
        else:
            # убираем номера позиций, которые бывают в выгрузках из баз (например, GenBank)
            lines.append("".join(ch for ch in line if not ch.isdigit()))
    if lines or header is not None:
        records.append((header, lines))
    if not records:
        return "", {"records": 0, "header": None}
    first_header, first_lines = records[0]
    seq = clean_sequence("\n".join(first_lines))
    return seq, {"records": len(records), "header": (first_header or "")[:200] or None}


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


def compact_result(result: dict) -> dict:
    """Для длинных последовательностей оставляет на странице и в базе только начало.

    Статистика (длина, состав, GC) и мутации уже посчитаны по всей последовательности."""
    n = len(result["sequence"])
    if n <= PREVIEW_LEN:
        return result
    result["sequence"] = result["sequence"][:PREVIEW_LEN]
    if result.get("reference"):
        result["reference"] = result["reference"][:PREVIEW_LEN]
    result["stats"]["rna"] = result["stats"]["rna"][:PREVIEW_LEN]
    result["stats"]["protein"] = result["stats"]["protein"][: PREVIEW_LEN // 3]
    result["truncated"] = True
    return result