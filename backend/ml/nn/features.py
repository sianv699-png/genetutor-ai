"""
Признаки мутации. Этот же файл потом использует сервер FastAPI,
поэтому признаки при обучении и на сайте всегда будут одинаковые.
"""
import math

import numpy as np
from Bio.Align import substitution_matrices

AA = "ACDEFGHIKLMNPQRSTVWY"
BLOSUM62 = substitution_matrices.load("BLOSUM62")

# Гидрофобность по шкале Кайта-Дулиттла
HYDRO = {
    "A": 1.8, "R": -4.5, "N": -3.5, "D": -3.5, "C": 2.5, "Q": -3.5, "E": -3.5,
    "G": -0.4, "H": -3.2, "I": 4.5, "L": 3.8, "K": -3.9, "M": 1.9, "F": 2.8,
    "P": -1.6, "S": -0.8, "T": -0.7, "W": -0.9, "Y": -1.3, "V": 4.2,
}
# Свойства Грантэма: состав (c), полярность (p), объём (v)
GRANTHAM = {
    "S": (1.42, 9.2, 32), "R": (0.65, 10.5, 124), "L": (0, 4.9, 111), "P": (0.39, 8.0, 32.5),
    "T": (0.71, 8.6, 61), "A": (0, 8.1, 31), "V": (0, 5.9, 84), "G": (0.74, 9.0, 3),
    "I": (0, 5.2, 111), "F": (0, 5.2, 132), "Y": (0.20, 6.2, 136), "C": (2.75, 5.5, 55),
    "H": (0.58, 10.4, 96), "Q": (0.89, 10.5, 85), "N": (1.33, 11.6, 56), "K": (0.33, 11.3, 119),
    "D": (1.38, 13.0, 54), "E": (0.92, 12.3, 83), "M": (0, 5.7, 105), "W": (0.13, 5.4, 170),
}
# Заряд при pH 7
CHARGE = {aa: 0 for aa in AA}
CHARGE.update({"D": -1, "E": -1, "K": 1, "R": 1})


def grantham_distance(a: str, b: str) -> float:
    """Расстояние Грантэма: чем больше, тем сильнее аминокислоты отличаются."""
    c1, p1, v1 = GRANTHAM[a]
    c2, p2, v2 = GRANTHAM[b]
    return 50.723 * math.sqrt(1.833 * (c1 - c2) ** 2 + 0.1018 * (p1 - p2) ** 2 + 0.000399 * (v1 - v2) ** 2)


FEATURE_NAMES = (
    ["blosum62", "grantham",
     "hydro_ref", "hydro_alt", "hydro_diff",
     "volume_ref", "volume_alt", "volume_diff",
     "polarity_ref", "polarity_alt", "polarity_diff",
     "charge_ref", "charge_alt", "charge_changed"]
    + [f"ref_{aa}" for aa in AA]
    + [f"alt_{aa}" for aa in AA]
)


def variant_features(ref: str, alt: str, pos: int) -> list:
    """Превращает одну замену (например R, W, 123) в список чисел для нейросети."""
    ref, alt = ref.upper(), alt.upper()
    if ref not in AA or alt not in AA:
        raise ValueError(f"Неизвестная аминокислота: {ref} или {alt}")
    feats = [
        float(BLOSUM62[ref, alt]),
        grantham_distance(ref, alt),
        HYDRO[ref], HYDRO[alt], HYDRO[alt] - HYDRO[ref],
        GRANTHAM[ref][2], GRANTHAM[alt][2], GRANTHAM[alt][2] - GRANTHAM[ref][2],
        GRANTHAM[ref][1], GRANTHAM[alt][1], GRANTHAM[alt][1] - GRANTHAM[ref][1],
        CHARGE[ref], CHARGE[alt], float(CHARGE[ref] != CHARGE[alt]),
        
    ]
    feats += [1.0 if aa == ref else 0.0 for aa in AA]  # какая аминокислота была
    feats += [1.0 if aa == alt else 0.0 for aa in AA]  # какая стала
    return feats


def build_matrix(df) -> np.ndarray:
    """Признаки для всей таблицы с колонками ref, alt, pos."""
    return np.array(
        [variant_features(r, a, p) for r, a, p in zip(df["ref"], df["alt"], df["pos"])],
        dtype=np.float32,
    )
