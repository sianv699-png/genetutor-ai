import datetime
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from database import users
from auth import hash_password, verify_password, create_token, get_current_user

app = FastAPI()

# разрешаем фронтенду (порт 3000) обращаться к серверу (порт 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterIn(BaseModel):
    name: str
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/register")
def register(data: RegisterIn):
    name = data.name.strip()
    email = data.email.strip().lower()

    if not name:
        raise HTTPException(status_code=400, detail="Введите имя")
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Некорректный email")
    if len(data.password) < 6 or len(data.password) > 64:
        raise HTTPException(status_code=400, detail="Пароль должен быть от 6 до 64 символов")

    user = {
        "name": name,
        "email": email,
        "password_hash": hash_password(data.password),
        "created_at": datetime.datetime.now(datetime.timezone.utc),
    }
    try:
        result = users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Этот email уже зарегистрирован")

    return {"token": create_token(str(result.inserted_id))}


@app.post("/api/login")
def login(data: LoginIn):
    user = users.find_one({"email": data.email.strip().lower()})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    return {"token": create_token(str(user["_id"]))}


@app.get("/api/me")
def me(user: dict = Depends(get_current_user)):
    return {"id": str(user["_id"]), "name": user["name"], "email": user["email"]}