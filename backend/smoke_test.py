"""Сквозная проверка: сервер, регистрация, вход, анализ и запись в базу данных.

Перед запуском сервер должен работать: uvicorn main:app --reload
Запуск из папки backend:  python smoke_test.py
"""
import json
import sys
import time
import urllib.error
import urllib.request

from sqlalchemy import text

from database import engine

BASE = "http://127.0.0.1:8000"
results = []


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name + (f"  ({detail})" if detail else ""))


print("База данных:", engine.dialect.name)

try:
    status, data = call("GET", "/api/health")
    check("сервер отвечает", status == 200 and data.get("status") == "ok")
except Exception as e:
    print("Сервер не отвечает. Запустите: uvicorn main:app --reload\n", e)
    sys.exit(1)

email = f"smoke_{int(time.time())}@test.com"
status, data = call("POST", "/api/register", {"name": "Smoke", "email": email, "password": "123456"})
check("регистрация", status == 200 and "token" in data, f"код {status}")

status, dup = call("POST", "/api/register", {"name": "Smoke", "email": email, "password": "123456"})
check("повторный email отклонён", status == 400, f"код {status}")

status, data = call("POST", "/api/login", {"email": email, "password": "123456"})
check("вход", status == 200 and "token" in data, f"код {status}")
token = data.get("token")

status, _ = call("POST", "/api/login", {"email": email, "password": "wrong-password"})
check("неверный пароль отклонён", status == 401, f"код {status}")

status, data = call("GET", "/api/me", token=token)
check("защищённый /api/me", status == 200 and data.get("email") == email, f"код {status}")

status, _ = call("GET", "/api/me")
check("без токена доступ закрыт", status in (401, 403), f"код {status}")

status, data = call(
    "POST", "/api/analyze",
    {"sequence": "ATGGTGCACCTGACTCCTGTGGAGAAG", "reference": "ATGGTGCACCTGACTCCTGAGGAGAAG"},
    token=token,
)
muts = data.get("mutations") or []
check("анализ находит мутацию", status == 200 and len(muts) == 1 and muts[0].get("ref_aa") == "E" and muts[0].get("alt_aa") == "V")

status, prog = call("GET", "/api/progress", token=token)
totals = prog.get("totals", {})
check(
    "профиль и прогресс",
    status == 200 and totals.get("analyses") == 1 and totals.get("attempts") == 0 and "level" in prog,
    f"код {status}",
)

with engine.connect() as conn:
    users = conn.execute(text("select count(*) from users where email = :e"), {"e": email}).scalar()
    analyses = conn.execute(
        text("select count(*) from analyses a join users u on u.id = a.user_id where u.email = :e"),
        {"e": email},
    ).scalar()
check("пользователь записан в базу", users == 1, f"строк: {users}")
check("анализ записан в базу", analyses == 1, f"строк: {analyses}")

print(f"\nИтого: {sum(results)} из {len(results)} проверок пройдено")
sys.exit(0 if all(results) else 1)
