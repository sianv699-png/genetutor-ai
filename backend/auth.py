import os
import datetime
from pathlib import Path

import bcrypt
import jwt
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from database import users

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret")
bearer = HTTPBearer()


def hash_password(password: str) -> str:
    """Превращает пароль в хеш. Исходный пароль восстановить нельзя."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Проверяет, подходит ли введённый пароль к хешу из базы."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_token(user_id: str) -> str:
    """Создаёт токен (JWT), действующий 12 часов."""
    payload = {
        "sub": user_id,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=12),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    """Достаёт пользователя по токену. Используется в защищённых эндпоинтах."""
    try:
        data = jwt.decode(creds.credentials, SECRET_KEY, algorithms=["HS256"])
        user = users.find_one({"_id": ObjectId(data["sub"])})
    except Exception:
        raise HTTPException(status_code=401, detail="Недействительный токен")
    if user is None:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    return user