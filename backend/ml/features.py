"""Признаки замены аминокислоты для оценки патогенности.

Три набора признаков (каждый следующий включает предыдущий):
  base      19 признаков: BLOSUM62, гидрофобность, объём, заряд и особые замены;
  extended  + 9 матриц замен, 4 шкалы свойств аминокислот, классы аминокислот;
  full      + контекст нуклеотидной замены: позиция в кодоне и тип замены.
"""
from functools import lru_cache

from Bio.Align import substitution_matrices
from Bio.SeqUtils import ProtParamData

AA = "ACDEFGHIKLMNPQRSTVWY"

BLOSUM62 = substitution_matrices.load("BLOSUM62")

# гидрофобность по шкале Кайта-Дулитла
HYDRO = {
    "A": 1.8, "R": -4.5, "N": -3.5, "D": -3.5, "C": 2.5, "Q": -3.5, "E": -3.5,
    "G": -0.4, "H": -3.2, "I": 4.5, "L": 3.8, "K": -3.9, "M": 1.9, "F": 2.8,
    "P": -1.6, "S": -0.8, "T": -0.7, "W": -0.9, "Y": -1.3, "V": 4.2,
}

# объём остатка, Å^3 (Zamyatnin, 1972)
VOLUME = {
    "G": 60.1, "A": 88.6, "S": 89.0, "C": 108.5, "D": 111.1, "P": 112.7,
    "N": 114.1, "T": 116.1, "E": 138.4, "V": 140.0, "Q": 143.8, "H": 153.2,
    "M": 162.9, "I": 166.7, "L": 166.7, "K": 168.6, "R": 173.4, "F": 189.9,
    "Y": 193.6, "W": 227.8,
}

# заряд боковой цепи при нейтральном pH (упрощённо)
CHARGE = {"D": -1, "E": -1, "K": 1, "R": 1}

AROMATIC = set("FWY")

# дополнительные матрицы замен из Biopython (физико-химические и структурные)
EXTRA_MATRICES = ["PAM250", "GONNET1992", "JOHNSON", "RISLER", "MCLACHLAN", "LEVIN", "STR", "BENNER74", "GENETIC"]
_MATRICES = {name: substitution_matrices.load(name) for name in EXTRA_MATRICES}

# дополнительные шкалы свойств аминокислот (Biopython ProtParamData)
SCALES = {
    "hopp_woods": ProtParamData.hw,    # гидрофильность
    "flexibility": ProtParamData.Flex,  # гибкость
    "surface": ProtParamData.em,        # доступность поверхности (Emini)
    "janin": ProtParamData.ja,          # склонность к погружению в белок
}

# классы аминокислот: 0 алифатические, 1 ароматические, 2 полярные, 3 положительные, 4 отрицательные, 5 особые
AA_CLASS = {}
for _cls, _letters in enumerate(["AVLIMC", "FWY", "STNQ", "KRH", "DE", "GP"]):
    for _a in _letters:
        AA_CLASS[_a] = _cls

BASE_NAMES = [
    "blosum62",
    "hydro_ref", "hydro_alt", "hydro_diff", "abs_hydro_diff",
    "volume_ref", "volume_alt", "volume_diff", "abs_volume_diff",
    "charge_ref", "charge_alt", "charge_change",
    "aromatic_change",
    "to_pro", "from_pro", "to_gly", "from_gly", "to_cys", "from_cys",
]

EXT_NAMES = (
    [f"mx_{name.lower()}" for name in EXTRA_MATRICES]
    + [f"{s}_{part}" for s in SCALES for part in ("ref", "alt", "diff")]
    + ["class_ref", "class_alt", "class_change"]
)

NT_PAIRS = [(a, b) for a in "ACGT" for b in "ACGT" if a != b]
NT_NAMES = ["codon_pos", "is_transition", "nt_change"]

FEATURE_GROUPS = {
    "base": BASE_NAMES,
    "extended": BASE_NAMES + EXT_NAMES,
    "full": BASE_NAMES + EXT_NAMES + NT_NAMES,
}

# для совместимости со старым кодом
FEATURE_NAMES = BASE_NAMES


@lru_cache(maxsize=None)
def _pair_all(ref: str, alt: str) -> tuple:
    """Признаки base + extended для пары аминокислот (кешируются: пар всего 380)."""
    hr, ha = HYDRO[ref], HYDRO[alt]
    vr, va = VOLUME[ref], VOLUME[alt]
    cr, ca = CHARGE.get(ref, 0), CHARGE.get(alt, 0)
    base = [
        float(BLOSUM62[ref][alt]),
        hr, ha, ha - hr, abs(ha - hr),
        vr, va, va - vr, abs(va - vr),
        cr, ca, abs(ca - cr),
        float((ref in AROMATIC) != (alt in AROMATIC)),
        float(alt == "P"), float(ref == "P"),
        float(alt == "G"), float(ref == "G"),
        float(alt == "C"), float(ref == "C"),
    ]
    ext = [float(_MATRICES[name][ref][alt]) for name in EXTRA_MATRICES]
    for scale in SCALES.values():
        ext += [float(scale[ref]), float(scale[alt]), float(scale[alt] - scale[ref])]
    ext += [float(AA_CLASS[ref]), float(AA_CLASS[alt]), float(AA_CLASS[ref] != AA_CLASS[alt])]
    return tuple(base + ext)


def _nt_features(nt_ref, nt_alt, codon_pos) -> list:
    """Контекст нуклеотидной замены; если данных нет, возвращает пропуски (NaN)."""
    nan = float("nan")
    try:
        pair_id = NT_PAIRS.index((nt_ref, nt_alt))
        pos = int(codon_pos)
        if pos not in (1, 2, 3):
            raise ValueError
    except (ValueError, TypeError):
        return [nan, nan, nan]
    transition = {nt_ref, nt_alt} in ({"A", "G"}, {"C", "T"})
    return [float(pos), float(transition), float(pair_id)]


def features(ref, alt, group="extended", nt_ref=None, nt_alt=None, codon_pos=None) -> list:
    """Вектор признаков заданного набора (base, extended или full)."""
    values = list(_pair_all(ref, alt))
    if group == "base":
        return values[: len(BASE_NAMES)]
    if group == "extended":
        return values
    return values + _nt_features(nt_ref, nt_alt, codon_pos)


def pair_features(ref: str, alt: str) -> list:
    """Базовые 19 признаков (оставлено для совместимости)."""
    return features(ref, alt, "base")
