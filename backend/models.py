import datetime

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from database import Base

# в PostgreSQL результат хранится как JSONB, в SQLite как обычный JSON
JsonType = JSON().with_variant(JSONB(), "postgresql")


def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    analyses = relationship("Analysis", back_populates="user", cascade="all, delete-orphan")
    attempts = relationship("TaskAttempt", back_populates="user", cascade="all, delete-orphan")


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    result = Column(JsonType, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)

    user = relationship("User", back_populates="analyses")


class TaskAttempt(Base):
    """Одна попытка студента ответить на задание (для статистики и прогресса)."""

    __tablename__ = "task_attempts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    topic = Column(String(80), nullable=False, default="Другое")
    question = Column(Text, nullable=False)
    student_answer = Column(Text, nullable=False)
    verdict = Column(String(30), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)

    user = relationship("User", back_populates="attempts")
    
class CaseProgress(Base):
    """Баллы пользователя за кейс (максимум задаётся в progress.py)."""

    __tablename__ = "case_progress"
    __table_args__ = (UniqueConstraint("user_id", "case_id", name="uq_user_case"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    case_id = Column(String(50), nullable=False)
    points = Column(Float, nullable=False, default=0.0)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)