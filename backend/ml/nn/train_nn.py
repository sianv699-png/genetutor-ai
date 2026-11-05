"""
Шаг 2. Обучает нейросеть и сравнивает её с классической ML-моделью.
Проверка честная: тестовые гены модель во время обучения не видит.
Запуск: python train_nn.py
"""
import json
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler

from features import FEATURE_NAMES, build_matrix
from model import VariantNet

torch.manual_seed(42)
np.random.seed(42)
Path("models").mkdir(exist_ok=True)

# ---------- данные ----------
df = pd.read_csv("data/missense.csv")
print(f"Загружено {len(df)} вариантов, считаю признаки...")
X = build_matrix(df)
y = df["label"].values.astype(np.float32)
genes = df["gene"].values

# 20% генов уходят в тест, ещё часть генов в валидацию (для ранней остановки)
trval, test = next(GroupShuffleSplit(1, test_size=0.2, random_state=42).split(X, y, genes))
tr, va = next(GroupShuffleSplit(1, test_size=0.15, random_state=7).split(X[trval], y[trval], genes[trval]))
train, val = trval[tr], trval[va]
print(f"train {len(train)} | val {len(val)} | test {len(test)} (тестовые гены не пересекаются с обучающими)")

# ---------- классическая модель для сравнения ----------
baseline = HistGradientBoostingClassifier(max_iter=300, random_state=42)
baseline.fit(X[train], y[train])
base_auc = roc_auc_score(y[test], baseline.predict_proba(X[test])[:, 1])
print(f"\nКлассическая ML-модель (gradient boosting): ROC AUC на новых генах = {base_auc:.3f}")

# ---------- нейросеть ----------
scaler = StandardScaler().fit(X[train])
to_t = lambda a: torch.tensor(scaler.transform(a), dtype=torch.float32)
Xtr, Xva, Xte = to_t(X[train]), to_t(X[val]), to_t(X[test])
ytr = torch.tensor(y[train]).unsqueeze(1)

net = VariantNet(Xtr.shape[1])
n_pos = float(y[train].sum())
pos_weight = torch.tensor([(len(train) - n_pos) / max(n_pos, 1.0)], dtype=torch.float32)  # учёт дисбаланса классов
loss_fn = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
opt = torch.optim.Adam(net.parameters(), lr=1e-3, weight_decay=1e-4)


def predict(x):
    net.eval()
    with torch.no_grad():
        return torch.sigmoid(net(x)).numpy().ravel()


best_auc, best_state, patience = 0.0, None, 0
print("\nОбучаю нейросеть...")
for epoch in range(1, 61):
    t0 = time.time()
    net.train()
    perm = torch.randperm(len(Xtr))
    for i in range(0, len(Xtr), 512):
        idx = perm[i:i + 512]
        opt.zero_grad()
        loss = loss_fn(net(Xtr[idx]), ytr[idx])
        loss.backward()
        opt.step()

    val_auc = roc_auc_score(y[val], predict(Xva))
    print(f"эпоха {epoch:2d}  loss {loss.item():.4f}  val AUC {val_auc:.3f}  ({time.time() - t0:.1f} c)")
    if val_auc > best_auc:
        best_auc, patience = val_auc, 0
        best_state = {k: v.clone() for k, v in net.state_dict().items()}
    else:
        patience += 1
        if patience >= 6:  # 6 эпох без улучшения: останавливаемся, чтобы не переобучиться
            print("Качество перестало расти, останавливаю обучение")
            break

net.load_state_dict(best_state)
nn_auc = roc_auc_score(y[test], predict(Xte))

print("\n========== ИТОГ (тест на новых генах) ==========")
print(f"Классическая ML-модель: ROC AUC = {base_auc:.3f}")
print(f"Нейросеть:              ROC AUC = {nn_auc:.3f}")

# ---------- сохранение ----------
torch.save(net.state_dict(), "models/variant_nn.pt")
joblib.dump(scaler, "models/scaler.joblib")
Path("models/meta.json").write_text(json.dumps({
    "n_features": len(FEATURE_NAMES),
    "feature_names": FEATURE_NAMES,
    "test_auc_nn": round(nn_auc, 4),
    "test_auc_baseline": round(base_auc, 4),
    "n_train": int(len(train)), "n_test": int(len(test)),
}, ensure_ascii=False, indent=2), encoding="utf-8")
print("Модель сохранена в папку models/")
