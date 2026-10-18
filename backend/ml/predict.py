from pathlib import Path

import joblib

from .features import AA, pair_features

MODEL_PATH = Path(__file__).resolve().parent / "variant_model.joblib"
_bundle = {}


def _load():
    if "model" not in _bundle:
        if not MODEL_PATH.exists():
            return None
        _bundle.update(joblib.load(MODEL_PATH))
    return _bundle


def predict_missense(ref_aa, alt_aa):
    """Оценка вероятности патогенности замены ref_aa -> alt_aa (однобуквенные коды).
    Возвращает None, если модель не обучена или аминокислоты некорректны."""
    if not ref_aa or not alt_aa:
        return None
    ref, alt = str(ref_aa).upper(), str(alt_aa).upper()
    if ref == alt or ref not in AA or alt not in AA or len(ref) != 1 or len(alt) != 1:
        return None
    bundle = _load()
    if bundle is None:
        return None
    p = float(bundle["model"].predict_proba([pair_features(ref, alt)])[0][1])
    if p >= 0.65:
        label = "скорее патогенная"
    elif p <= 0.35:
        label = "скорее нейтральная"
    else:
        label = "неопределённая"
    return {"probability": round(p, 2), "label": label}
