"""
Шаг 3. Проверка: загружаем сохранённую нейросеть и предсказываем несколько мутаций.
Функцию predict_variant потом почти без изменений перенесём в FastAPI.
Запуск: python predict_test.py
"""
import json

import joblib
import torch

from features import variant_features
from model import VariantNet

meta = json.load(open("models/meta.json", encoding="utf-8"))
scaler = joblib.load("models/scaler.joblib")
net = VariantNet(meta["n_features"])
net.load_state_dict(torch.load("models/variant_nn.pt"))
net.eval()


def predict_variant(ref: str, alt: str, pos: int) -> float:
    x = scaler.transform([variant_features(ref, alt, pos)])
    with torch.no_grad():
        return torch.sigmoid(net(torch.tensor(x, dtype=torch.float32))).item()


examples = [
    ("C", "G", 61, "BRCA1, разрушение цистеина в цинковом пальце"),
    ("R", "W", 248, "замена заряженной аминокислоты на крупную ароматическую"),
    ("L", "I", 150, "очень похожие аминокислоты"),
    ("V", "A", 300, "мягкая замена"),
]
for ref, alt, pos, note in examples:
    p = predict_variant(ref, alt, pos)
    verdict = "вероятно патогенная" if p >= 0.5 else "вероятно доброкачественная"
    print(f"p.{ref}{pos}{alt}: {p:.2f} -> {verdict}   ({note})")
