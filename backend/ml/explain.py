"""Объяснение оценки модели: какие свойства замены повлияли на результат.

Метод («что если»): для каждого свойства замены (заряд, объём, гидрофобность,
типичность замены, особые остатки) его признаки подменяются средними значениями
по типичным заменам (по всем заменам аминокислот, достижимым одной точечной
заменой нуклеотида), и считается, как изменилась бы оценка модели.
Положительный вклад означает, что свойство повышает оценку патогенности
по сравнению с типичной заменой, отрицательный означает, что снижает.

Это пояснение к модели, а не доказательство причины болезни. Вклады считаются
по отдельности и в сумме не обязаны давать итоговую оценку (признаки связаны).
"""
from functools import lru_cache

import numpy as np
from Bio.Data import CodonTable

from .features import AA, BLOSUM62, CHARGE, FEATURE_GROUPS, HYDRO, VOLUME, features
from .predict import _label, _load

GROUPS = ["charge", "volume", "hydropathy", "substitution", "residue"]

SPECIAL_FLAGS = ["to_pro", "from_pro", "to_gly", "from_gly", "to_cys", "from_cys", "aromatic_change"]


def _group_of(name: str):
    if name.startswith("charge_"):
        return "charge"
    if name.startswith("volume_") or name == "abs_volume_diff":
        return "volume"
    if name.startswith(("hydro_", "hopp_woods_", "janin_", "surface_")) or name == "abs_hydro_diff":
        return "hydropathy"
    if name == "blosum62" or name.startswith("mx_"):
        return "substitution"
    if name in SPECIAL_FLAGS or name.startswith(("class_", "flexibility_")):
        return "residue"
    return None  # контекст нуклеотидной замены не объясняется


@lru_cache(maxsize=None)
def _reachable_pairs() -> tuple:
    """Пары аминокислот, возможные при замене одного нуклеотида."""
    table = CodonTable.unambiguous_dna_by_id[1].forward_table
    pairs = set()
    for codon, aa in table.items():
        for i in range(3):
            for nt in "ACGT":
                if nt == codon[i]:
                    continue
                aa2 = table.get(codon[:i] + nt + codon[i + 1:])
                if aa2 and aa2 != aa:
                    pairs.add((aa, aa2))
    return tuple(sorted(pairs))


@lru_cache(maxsize=None)
def _baseline() -> np.ndarray:
    """Средний вектор признаков (base + extended) по типичным заменам."""
    rows = [features(r, a, "extended") for r, a in _reachable_pairs()]
    return np.mean(np.array(rows, dtype=float), axis=0)


def explain_missense(ref_aa, alt_aa, nt_ref=None, nt_alt=None, codon_pos=None):
    """Оценка модели и вклад свойств замены. None, если модель недоступна или замена некорректна."""
    if not ref_aa or not alt_aa:
        return None
    ref, alt = str(ref_aa).upper(), str(alt_aa).upper()
    if ref == alt or ref not in AA or alt not in AA or len(ref) != 1 or len(alt) != 1:
        return None
    bundle = _load()
    if bundle is None:
        return None

    if "model" in bundle:  # старый формат файла модели (версия 2)
        estimator, group, variant = bundle["model"], "base", "aa"
    else:
        has_context = (
            nt_ref in ("A", "C", "G", "T") and nt_alt in ("A", "C", "G", "T")
            and nt_ref != nt_alt and codon_pos in (1, 2, 3)
        )
        variant = "full" if has_context else "aa"
        entry = bundle["models"][variant]
        estimator, group = entry["estimator"], entry["group"]

    names = FEATURE_GROUPS[group]
    vec = np.array(features(ref, alt, group, nt_ref, nt_alt, codon_pos), dtype=float)
    base = _baseline()

    rows, keys = [vec], []
    for g in GROUPS:
        idx = [i for i, n in enumerate(names) if _group_of(n) == g]
        if not idx:
            continue
        v = vec.copy()
        v[idx] = base[idx]
        rows.append(v)
        keys.append(g)
    all_idx = [i for i, n in enumerate(names) if _group_of(n)]
    typical = vec.copy()
    typical[all_idx] = base[all_idx]
    rows.append(typical)

    probs = estimator.predict_proba(np.array(rows))[:, 1]
    p = float(probs[0])
    factors = [{"key": k, "impact": round(p - float(probs[1 + j]), 3)} for j, k in enumerate(keys)]
    factors.sort(key=lambda f: abs(f["impact"]), reverse=True)

    flags = {
        "to_pro": alt == "P", "from_pro": ref == "P", "to_gly": alt == "G", "from_gly": ref == "G",
        "to_cys": alt == "C", "from_cys": ref == "C",
        "aromatic_change": (ref in "FWY") != (alt in "FWY"),
    }
    return {
        "probability": round(p, 2),
        "label": _label(p),
        "variant": variant,
        "typical_probability": round(float(probs[-1]), 2),
        "properties": {
            "charge": {"ref": CHARGE.get(ref, 0), "alt": CHARGE.get(alt, 0)},
            "volume": {"ref": VOLUME[ref], "alt": VOLUME[alt]},
            "hydropathy": {"ref": HYDRO[ref], "alt": HYDRO[alt]},
            "blosum62": int(BLOSUM62[ref][alt]),
            "special": [f for f in SPECIAL_FLAGS if flags[f]],
        },
        "factors": factors,
    }
