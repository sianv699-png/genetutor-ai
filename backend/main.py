import time

from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import User, Analysis, TaskAttempt, CaseProgress
from auth import (
    hash_password,
    verify_password,
    create_token,
    get_current_user,
)
from analysis import (
    clean_sequence,
    validate,
    basic_stats,
    find_mutations,
    compact_result,
    decode_upload,
    parse_fasta,
    MAX_TEXT_LEN,
    MAX_FILE_LEN,
    MAX_FILE_BYTES,
    MAX_MUTATIONS,
    MAX_DIFF_SHARE,
    MIN_LEN_FOR_DIFF_CHECK,
)
from llm import explain_and_tasks, check_answer, LLMError, TOPICS
from agent import run_agent
from progress import (
    build_progress,
    tier_status,
    SCORE,
    CASE_TIERS,
    CASE_MAX_POINTS,
    CASE_PASS_POINTS,
)

try:
    from ml.predict import predict_missense
except ImportError:
    def predict_missense(ref_aa, alt_aa, **kwargs):
        return None

try:
    from ml.explain import explain_missense
except ImportError:  # модуль объяснения оценки ещё не установлен
    def explain_missense(*args, **kwargs):
        return None


# создаёт таблицы в базе, если их ещё нет (новые таблицы добавляются автоматически)
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
    tier: int = 0


class CheckIn(BaseModel):
    result: dict
    question: str
    reference_answer: str
    student_answer: str
    topic: str = ""
    case_id: str = ""


class AgentIn(BaseModel):
    message: str
    history: list = Field(default_factory=list)


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


# ---------- ML-оценка мутаций ----------

def _ml_for_mutation(m: dict):
    """Оценка патогенности одной мутации нейросетью (или старой моделью, если нейросеть недоступна).

    position в мутации — номер нуклеотида (с 1), из него считаем позицию в кодоне и в белке."""
    pos = m.get("position")
    try:
        return predict_missense(
            m.get("ref_aa"), m.get("alt_aa"),
            nt_ref=m.get("ref"), nt_alt=m.get("alt"),
            codon_pos=(pos - 1) % 3 + 1 if pos else None,
            protein_pos=(pos - 1) // 3 + 1 if pos else None,
        )
    except TypeError:  # версия модуля без нуклеотидного контекста
        return predict_missense(m.get("ref_aa"), m.get("alt_aa"))


def run_analysis(seq: str, ref: str, max_len: int) -> dict:
    """Общий анализ для текста и файлов. seq и ref уже очищены, ref может быть пустым.

    Ошибки возвращаются пользователю как HTTPException с понятным текстом."""
    error = validate(seq, max_len)
    if error:
        raise HTTPException(status_code=400, detail=error)

    result = {"sequence": seq, "stats": basic_stats(seq), "mutations": None}

    if ref:
        error = validate(ref, max_len)
        if error:
            raise HTTPException(status_code=400, detail="Эталон: " + error)
        if len(ref) != len(seq):
            raise HTTPException(
                status_code=400,
                detail=f"Длины различаются ({len(ref)} и {len(seq)}). Пока поддерживается сравнение одинаковой длины.",
            )
        mutations = find_mutations(ref, seq)
        if len(seq) >= MIN_LEN_FOR_DIFF_CHECK and len(mutations) > MAX_DIFF_SHARE * len(seq):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Последовательности отличаются в {len(mutations)} позициях из {len(seq)}. "
                    "Похоже, это разные гены или участки: проверьте, что эталон соответствует образцу."
                ),
            )
        result["reference"] = ref
        result["mutations_total"] = len(mutations)
        result["mutations"] = mutations[:MAX_MUTATIONS]
        for m in result["mutations"]:
            pred = _ml_for_mutation(m)
            if pred:
                m["ml"] = pred

    return compact_result(result)


@app.post("/api/analyze")
def analyze(
    data: AnalyzeIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    seq = clean_sequence(data.sequence)
    ref = clean_sequence(data.reference) if data.reference.strip() else ""
    result = run_analysis(seq, ref, MAX_TEXT_LEN)

    db.add(Analysis(user_id=user.id, result=result))
    db.commit()
    return result


# ---------- анализ файлов FASTA ----------

async def _read_upload(f: UploadFile, label: str):
    """Читает загруженный файл с проверкой размера и разбирает FASTA."""
    data = await f.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"{label}: файл больше {MAX_FILE_BYTES // 1_000_000} МБ.",
        )
    seq, info = parse_fasta(decode_upload(data))
    if not seq:
        raise HTTPException(status_code=400, detail=f"{label}: в файле не найдена последовательность.")
    info["filename"] = (f.filename or "")[:200]
    return seq, info


@app.post("/api/analyze/file")
async def analyze_file(
    sequence_file: UploadFile | None = File(None),
    sequence_text: str = Form(""),
    reference_file: UploadFile | None = File(None),
    reference_text: str = Form(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Анализ с загрузкой файлов. Образец и эталон можно передать файлом или текстом."""
    source = {}

    if sequence_file is not None and sequence_file.filename:
        seq, source["sequence"] = await _read_upload(sequence_file, "Образец")
    else:
        seq = clean_sequence(sequence_text)

    if reference_file is not None and reference_file.filename:
        ref, source["reference"] = await _read_upload(reference_file, "Эталон")
    elif reference_text.strip():
        ref = clean_sequence(reference_text)
    else:
        ref = ""

    # анализ длинной последовательности выполняем в отдельном потоке, чтобы не блокировать сервер
    result = await run_in_threadpool(run_analysis, seq, ref, MAX_FILE_LEN)
    if source:
        result["source"] = source

    db.add(Analysis(user_id=user.id, result=result))
    db.commit()
    return result


# ---------- гостевой анализ (без регистрации) ----------

GUEST_WINDOW_SECONDS = 600   # окно подсчёта запросов, секунд
GUEST_MAX_REQUESTS = 15      # максимум гостевых запросов с одного адреса за окно
GUEST_MAX_LENGTH = 600       # максимальная длина последовательности для гостя
_guest_hits = {}


def _guest_allowed(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _guest_hits.get(ip, []) if now - t < GUEST_WINDOW_SECONDS]
    allowed = len(hits) < GUEST_MAX_REQUESTS
    if allowed:
        hits.append(now)
    _guest_hits[ip] = hits
    return allowed


@app.post("/api/guest/analyze")
def guest_analyze(data: AnalyzeIn, request: Request):
    """Анализ без регистрации: ничего не сохраняется, ИИ не вызывается."""
    ip = request.client.host if request.client else "unknown"
    if not _guest_allowed(ip):
        raise HTTPException(
            status_code=429,
            detail="Слишком много запросов. Подождите несколько минут или создайте аккаунт.",
        )

    seq = clean_sequence(data.sequence)
    if len(seq) > GUEST_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"В гостевом режиме максимум {GUEST_MAX_LENGTH} нуклеотидов. Создайте аккаунт для длинных последовательностей.",
        )
    ref = clean_sequence(data.reference) if data.reference.strip() else ""
    return run_analysis(seq, ref, GUEST_MAX_LENGTH)


# ---------- объяснение ML-оценки ----------

EXPLAIN_MAX_REQUESTS = 60    # максимум запросов объяснения с одного адреса за окно
_explain_hits = {}


def _explain_allowed(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _explain_hits.get(ip, []) if now - t < GUEST_WINDOW_SECONDS]
    allowed = len(hits) < EXPLAIN_MAX_REQUESTS
    if allowed:
        hits.append(now)
    _explain_hits[ip] = hits
    return allowed


class MlExplainIn(BaseModel):
    ref_aa: str
    alt_aa: str
    nt_ref: str = ""
    nt_alt: str = ""
    codon_pos: int = 0


@app.post("/api/ml/explain")
def ml_explain(data: MlExplainIn, request: Request):
    """Какие свойства замены повлияли на оценку модели. Доступно без регистрации."""
    ip = request.client.host if request.client else "unknown"
    if not _explain_allowed(ip):
        raise HTTPException(status_code=429, detail="Слишком много запросов. Подождите несколько минут.")
    result = explain_missense(
        data.ref_aa, data.alt_aa,
        nt_ref=data.nt_ref or None, nt_alt=data.nt_alt or None,
        codon_pos=data.codon_pos or None,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Для этой замены оценка модели недоступна.")
    return result


# ---------- ИИ, проверка ответов, прогресс ----------

@app.post("/api/explain")
def explain(data: ExplainIn, user: User = Depends(get_current_user)):
    try:
        return explain_and_tasks(data.result, data.tier)
    except LLMError as e:
        raise HTTPException(status_code=503, detail=str(e))


def load_case_points(db: Session, user_id: int) -> dict:
    rows = db.query(CaseProgress).filter(CaseProgress.user_id == user_id).all()
    return {r.case_id: float(r.points) for r in rows}


@app.post("/api/check")
def check(
    data: CheckIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not data.student_answer.strip():
        raise HTTPException(status_code=400, detail="Введите ответ")
    try:
        verdict = check_answer(
            data.result, data.question, data.reference_answer, data.student_answer
        )
    except LLMError as e:
        raise HTTPException(status_code=503, detail=str(e))

    question = data.question[:1000]
    gain = SCORE.get(verdict["verdict"], 0.0)
    answered_before = (
        db.query(TaskAttempt)
        .filter(TaskAttempt.user_id == user.id, TaskAttempt.question == question)
        .first()
        is not None
    )

    # сохраняем попытку для профиля и прогресса
    db.add(TaskAttempt(
        user_id=user.id,
        topic=data.topic if data.topic in TOPICS else "Другое",
        question=question,
        student_answer=data.student_answer[:2000],
        verdict=verdict["verdict"],
    ))

    if data.case_id in CASE_TIERS:
        before = tier_status(load_case_points(db, user.id))["unlocked"]
        row = (
            db.query(CaseProgress)
            .filter(CaseProgress.user_id == user.id, CaseProgress.case_id == data.case_id)
            .first()
        )
        if row is None:
            row = CaseProgress(user_id=user.id, case_id=data.case_id, points=0.0)
            db.add(row)
        # баллы за кейс: один и тот же вопрос засчитывается один раз, максимум CASE_MAX_POINTS
        if gain > 0 and not answered_before:
            row.points = min(CASE_MAX_POINTS, float(row.points or 0.0) + gain)
        db.commit()
        status = tier_status(load_case_points(db, user.id))
        verdict["case"] = {
            "case_id": data.case_id,
            "points": float(row.points),
            "max_points": CASE_MAX_POINTS,
            "completed": float(row.points) >= CASE_PASS_POINTS,
            "level_up": status["level"]["name"] if status["unlocked"] > before else None,
        }
    else:
        db.commit()
    return verdict


@app.get("/api/case-status")
def case_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    points = load_case_points(db, user.id)
    status = tier_status(points)
    return {
        "unlocked": status["unlocked"],
        "level": status["level"],
        "tiers": status["tiers"],
        "points": points,
        "pass_points": CASE_PASS_POINTS,
        "max_points": CASE_MAX_POINTS,
    }


@app.get("/api/progress")
def get_progress(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    attempts = (
        db.query(TaskAttempt)
        .filter(TaskAttempt.user_id == user.id)
        .all()
    )

    analysis_dates = [
        row[0]
        for row in db.query(Analysis.created_at)
        .filter(Analysis.user_id == user.id)
        .all()
    ]

    return build_progress(
        user,
        attempts,
        analysis_dates,
        case_points=load_case_points(db, user.id),
    )


@app.post("/api/agent")
def agent_chat(data: AgentIn, user: User = Depends(get_current_user)):
    message = data.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Введите сообщение")
    try:
        return run_agent(user.id, message, data.history)
    except LLMError as e:
        raise HTTPException(status_code=503, detail=str(e))