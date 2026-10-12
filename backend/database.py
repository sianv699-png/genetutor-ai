import os
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

# .env лежит в корне проекта, на уровень выше папки backend
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    raise RuntimeError(f"MONGODB_URI не найден. Проверь файл: {ENV_PATH}")

client = MongoClient(MONGODB_URI)
db = client[os.getenv("MONGODB_DB", "genetutor")]

users = db["users"]
users.create_index("email", unique=True)