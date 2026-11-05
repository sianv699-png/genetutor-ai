from pathlib import Path

import joblib

from .features import AA, features

MODEL_PATH = Path(__file__).resolve().parent / "variant_model.joblib"
_bundle = {}


def _load():
    if "loaded" not in _bundle:
        if not MODEL_PATH.exists():
            return None
        _bundle["data"] = joblib.load(MODEL_PATH)
        _bundle["loaded"] = True
    return _bundle["data"]


def _label(p: float) -> str:
    if p >= 0.65:
        return "скорее патогенная"
    if p <= 0.35:
        return "скорее нейтральная"
    return "неопределённая"


def predict_missense(ref_aa, alt_aa, nt_ref=None, nt_alt=None, codon_pos=None):
    """Оценка вероятности патогенности замены ref_aa -> alt_aa (однобуквенные коды).

    Если известна нуклеотидная замена (nt_ref -> nt_alt) и позиция в кодоне (1-3),
    используется модель с контекстом нуклеотидов, иначе модель только по аминокислотам.
    Возвращает None, если модель не обучена или аминокислоты некорректны."""
    if not ref_aa or not alt_aa:
        return None
    ref, alt = str(ref_aa).upper(), str(alt_aa).upper()
    if ref == alt or ref not in AA or alt not in AA or len(ref) != 1 or len(alt) != 1:
        return None
    bundle = _load()
    if bundle is None:
        return None

    # старый формат файла модели (версия 2)
    if "model" in bundle:
        p = float(bundle["model"].predict_proba([features(ref, alt, "base")])[0][1])
        return {"probability": round(p, 2), "label": _label(p), "variant": "aa"}

    has_context = (
        nt_ref in ("A", "C", "G", "T") and nt_alt in ("A", "C", "G", "T")
        and nt_ref != nt_alt and codon_pos in (1, 2, 3)
    )
    key = "full" if has_context else "aa"
    entry = bundle["models"][key]
    vector = features(ref, alt, entry["group"], nt_ref, nt_alt, codon_pos)
    p = float(entry["estimator"].predict_proba([vector])[0][1])
    return {"probability": round(p, 2), "label": _label(p), "variant": key}
