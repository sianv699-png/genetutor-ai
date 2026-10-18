from Bio.Align import substitution_matrices

BLOSUM62 = substitution_matrices.load("BLOSUM62")

AA = "ACDEFGHIKLMNPQRSTVWY"

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

FEATURE_NAMES = [
    "blosum62",
    "hydro_ref", "hydro_alt", "hydro_diff", "abs_hydro_diff",
    "volume_ref", "volume_alt", "volume_diff", "abs_volume_diff",
    "charge_ref", "charge_alt", "charge_change",
    "aromatic_change",
    "to_pro", "from_pro", "to_gly", "from_gly", "to_cys", "from_cys",
]


def pair_features(ref: str, alt: str) -> list:
    """Признаки замены аминокислоты ref -> alt (однобуквенные коды)."""
    hr, ha = HYDRO[ref], HYDRO[alt]
    vr, va = VOLUME[ref], VOLUME[alt]
    cr, ca = CHARGE.get(ref, 0), CHARGE.get(alt, 0)
    return [
        float(BLOSUM62[ref][alt]),
        hr, ha, ha - hr, abs(ha - hr),
        vr, va, va - vr, abs(va - vr),
        cr, ca, abs(ca - cr),
        float((ref in AROMATIC) != (alt in AROMATIC)),
        float(alt == "P"), float(ref == "P"),
        float(alt == "G"), float(ref == "G"),
        float(alt == "C"), float(ref == "C"),
    ]
