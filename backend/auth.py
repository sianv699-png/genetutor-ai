import os
import datetime
from pathlib import Path

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from models import User

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret")
bearer = HTTPBearer()


def hash_password(password: str) -> str:
    """Превращает пароль в хеш. Исходный пароль восстановить нельзя."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Проверяет, подходит ли введённый пароль к хешу из базы."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_token(user_id: int) -> str:
    """Создаёт токен (JWT), действующий 12 часов."""
    payload = {
        "sub": str(user_id),
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=12),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    """Достаёт пользователя по токену. Используется в защищённых эндпоинтах."""
    try:
        data = jwt.decode(creds.credentials, SECRET_KEY, algorithms=["HS256"])
        user = db.get(User, int(data["sub"]))
    except Exception:
        raise HTTPException(status_code=401, detail="Недействительный токен")
    if user is None:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    return user