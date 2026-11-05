"""Архитектура нейросети. Нужна и для обучения, и для загрузки модели на сервере."""
import torch.nn as nn


class VariantNet(nn.Module):
    def __init__(self, n_features: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_features, 128), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(128, 64), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(64, 1),  # на выходе одно число: насколько вероятна патогенность
        )

    def forward(self, x):
        return self.net(x)
