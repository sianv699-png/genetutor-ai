from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import User, Analysis
from auth import hash_password, verify_password, create_token, get_current_user
from analysis import clean_sequence, validate, basic_stats, find_mutations
from llm import explain_and_tasks, check_answer, LLMError
from agent import run_agent
from ml.predict import predict_missense

# создаёт таблицы в базе, если их ещё нет
Base.metadata.create_all(bind=engine)

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


class AnalyzeIn(BaseModel):
    sequence: str
    reference: str = ""


class ExplainIn(BaseModel):
    result: dict


class CheckIn(BaseModel):
    result: dict
    question: str
    reference_answer: str
    student_answer: str


class AgentIn(BaseModel):
    message: str
    history: list = []


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/register")
def register(data: RegisterIn, db: Session = Depends(get_db)):
    name = data.name.strip()
    email = data.email.strip().lower()

    if not name:
        raise HTTPException(status_code=400, detail="Введите имя")
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Некорректный email")
    if len(data.password) < 6 or len(data.password) > 64:
        raise HTTPException(status_code=400, detail="Пароль должен быть от 6 до 64 символов")

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Этот email уже зарегистрирован")

    user = User(name=name, email=email, password_hash=hash_password(data.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Этот email уже зарегистрирован")
    db.refresh(user)

    return {"token": create_token(user.id)}


@app.post("/api/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.strip().lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    return {"token": create_token(user.id)}


@app.get("/api/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "name": user.name, "email": user.email}


@app.post("/api/analyze")
def analyze(
    data: AnalyzeIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    seq = clean_sequence(data.sequence)
    error = validate(seq)
    if error:
        raise HTTPException(status_code=400, detail=error)

    result = {"sequence": seq, "stats": basic_stats(seq), "mutations": None}

    if data.reference.strip():
        ref = clean_sequence(data.reference)
        error = validate(ref)
        if error:
            raise HTTPException(status_code=400, detail="Эталон: " + error)
        if len(ref) != len(seq):
            raise HTTPException(
                status_code=400,
                detail=f"Длины различаются ({len(ref)} и {len(seq)}). Пока поддерживается сравнение одинаковой длины.",
            )
        result["reference"] = ref
        result["mutations"] = find_mutations(ref, seq)
        for m in result["mutations"]:
            pred = predict_missense(m.get("ref_aa"), m.get("alt_aa"))
            if pred:
                m["ml"] = pred

    db.add(Analysis(user_id=user.id, result=result))
    db.commit()
    return result


@app.post("/api/explain")
def explain(data: ExplainIn, user: User = Depends(get_current_user)):
    try:
        return explain_and_tasks(data.result)
    except LLMError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/check")
def check(data: CheckIn, user: User = Depends(get_current_user)):
    if not data.student_answer.strip():
        raise HTTPException(status_code=400, detail="Введите ответ")
    try:
        return check_answer(
            data.result, data.question, data.reference_answer, data.student_answer
        )
    except LLMError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/agent")
def agent_chat(data: AgentIn, user: User = Depends(get_current_user)):
    message = data.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Введите сообщение")
    try:
        return run_agent(user.id, message, data.history)
    except LLMError as e:
        raise HTTPException(status_code=503, detail=str(e))