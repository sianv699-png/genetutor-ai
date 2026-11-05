"""
Нейросеть для сервера FastAPI: загружается один раз при первом запросе.
Файлы модели берутся из папки models/ рядом с этим файлом.
"""
import json
from pathlib import Path

import joblib
import torch

from .features import variant_features
from .model import VariantNet

MODELS_DIR = Path(__file__).resolve().parent / "models"
DEFAULT_PROTEIN_POS = 300  # если позиция неизвестна, берём типичную позицию в белке
_cache = {}


def _load():
    if "net" not in _cache:
        meta = json.loads((MODELS_DIR / "meta.json").read_text(encoding="utf-8"))
        net = VariantNet(meta["n_features"])
        net.load_state_dict(torch.load(MODELS_DIR / "variant_nn.pt", map_location="cpu"))
        net.eval()
        _cache["scaler"] = joblib.load(MODELS_DIR / "scaler.joblib")
        _cache["meta"] = meta
        _cache["net"] = net
    return _cache


def predict_nn(ref: str, alt: str, protein_pos=None) -> float:
    """Вероятность патогенности замены ref -> alt (однобуквенные коды аминокислот)."""
    m = _load()
    pos = protein_pos if protein_pos and protein_pos > 0 else DEFAULT_PROTEIN_POS
    x = m["scaler"].transform([variant_features(ref, alt, pos)])
    with torch.no_grad():
        return torch.sigmoid(m["net"](torch.tensor(x, dtype=torch.float32))).item()
