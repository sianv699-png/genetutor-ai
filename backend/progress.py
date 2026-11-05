"""Расчёт профиля и прогресса студента по его анализам и ответам на задания."""
import datetime

SCORE = {"верно": 1.0, "частично верно": 0.5, "неверно": 0.0}

# (минимум баллов, название уровня)
LEVELS = [(0, "Новичок"), (5, "Ученик"), (15, "Практик"), (40, "Знаток")]

# ---------- уровни и открытие кейсов ----------
TIERS = [
    {"id": 1, "name": "Любопытный"},
    {"id": 2, "name": "Школьник"},
    {"id": 3, "name": "Студент"},
    {"id": 4, "name": "Профессор"},
]
# id кейса -> уровень сложности (должно совпадать с frontend/lib/cases.js)
CASE_TIERS = {
    "hbb-sickle": 1,
    "hbb-silent": 1,
    "hbb-hbc": 2,
    "hbb-nonsense": 3,
}
CASE_MAX_POINTS = 5.0    # больше баллов за один кейс не засчитывается
CASE_PASS_POINTS = 3.0   # столько баллов нужно, чтобы кейс считался пройденным
REQUIRED_CASES = 2       # сколько кейсов уровня нужно пройти, чтобы открыть следующий


def tier_status(case_points: dict) -> dict:
    """Текущий уровень пользователя и состояние каждого уровня по баллам за кейсы."""
    details = []
    for t in TIERS:
        ids = [cid for cid, tier in CASE_TIERS.items() if tier == t["id"]]
        done = sum(1 for cid in ids if case_points.get(cid, 0.0) >= CASE_PASS_POINTS)
        details.append({"id": t["id"], "name": t["name"], "cases_total": len(ids),
                        "cases_done": done, "need": min(REQUIRED_CASES, len(ids))})
    unlocked = 1
    for i in range(len(TIERS) - 1):
        if details[i]["need"] > 0 and details[i]["cases_done"] >= details[i]["need"]:
            unlocked = i + 2
        else:
            break
    for d in details:
        d["unlocked"] = d["id"] <= unlocked
    cur = details[unlocked - 1]
    next_name = TIERS[unlocked]["name"] if unlocked < len(TIERS) else None
    if next_name is None:
        fraction = 1.0
    else:
        fraction = min(cur["cases_done"] / cur["need"], 1.0) if cur["need"] else 0.0
    level = {"name": cur["name"], "next_name": next_name, "cases_done": cur["cases_done"],
             "cases_needed": cur["need"], "fraction": round(fraction, 3), "tier": unlocked}
    return {"unlocked": unlocked, "level": level, "tiers": details}


WEAK_ACCURACY = 70  # тема считается слабой, если точность ниже этого значения (в процентах)


def _day(dt) -> datetime.date:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc).date()


def _streak(days: set, today: datetime.date) -> int:
    """Сколько дней подряд была активность (серия не сгорает, если сегодня ещё ничего не делали)."""
    cur = today if today in days else today - datetime.timedelta(days=1)
    streak = 0
    while cur in days:
        streak += 1
        cur -= datetime.timedelta(days=1)
    return streak


def _level(points: float) -> dict:
    idx = 0
    for i, (threshold, _) in enumerate(LEVELS):
        if points >= threshold:
            idx = i
    name = LEVELS[idx][1]
    if idx + 1 < len(LEVELS):
        nxt = LEVELS[idx + 1]
        low = LEVELS[idx][0]
        fraction = (points - low) / (nxt[0] - low)
        return {"name": name, "next_name": nxt[1], "next_at": nxt[0], "fraction": round(min(max(fraction, 0), 1), 3)}
    return {"name": name, "next_name": None, "next_at": None, "fraction": 1.0}


def build_progress(user, attempts: list, analysis_dates: list, today=None, case_points=None) -> dict:
    today = today or datetime.datetime.now(datetime.timezone.utc).date()
    status = tier_status(case_points or {})
    total = len(attempts)
    correct = sum(1 for a in attempts if a.verdict == "верно")
    partial = sum(1 for a in attempts if a.verdict == "частично верно")
    wrong = total - correct - partial
    points = sum(SCORE.get(a.verdict, 0.0) for a in attempts)
    accuracy = round(points / total * 100) if total else None

    # статистика по темам
    topics = {}
    for a in attempts:
        t = topics.setdefault(a.topic or "Другое", {"attempts": 0, "points": 0.0})
        t["attempts"] += 1
        t["points"] += SCORE.get(a.verdict, 0.0)
    by_topic = [
        {"topic": name, "attempts": v["attempts"], "accuracy": round(v["points"] / v["attempts"] * 100)}
        for name, v in topics.items()
    ]
    by_topic.sort(key=lambda x: (-x["attempts"], x["topic"]))

    weak = sorted(
        (t for t in by_topic if t["attempts"] >= 2 and t["accuracy"] < WEAK_ACCURACY),
        key=lambda t: t["accuracy"],
    )[:3]

    # активность по дням
    day_counts = {}
    for a in attempts:
        d = _day(a.created_at)
        day_counts[d] = day_counts.get(d, 0) + 1
    for created in analysis_dates:
        d = _day(created)
        day_counts[d] = day_counts.get(d, 0) + 1
    days = set(day_counts)
    streak = _streak(days, today)

    last7 = []
    for i in range(6, -1, -1):
        d = today - datetime.timedelta(days=i)
        last7.append({"date": d.isoformat(), "count": day_counts.get(d, 0)})

    analyses_count = len(analysis_dates)

    achievements = [
        {"title": "Первый анализ", "description": "Проанализируйте первую последовательность", "earned": analyses_count >= 1},
        {"title": "5 анализов", "description": "Сделайте пять анализов", "earned": analyses_count >= 5},
        {"title": "Первые ответы", "description": "Ответьте на 5 заданий", "earned": total >= 5},
        {"title": "20 ответов", "description": "Ответьте на 20 заданий", "earned": total >= 20},
        {"title": "Точный ответ", "description": "Точность не ниже 80% при 10 ответах и больше", "earned": total >= 10 and (accuracy or 0) >= 80},
        {"title": "Три дня подряд", "description": "Занимайтесь три дня подряд", "earned": streak >= 3},
    ]

    recent = [
        {
            "question": a.question,
            "topic": a.topic,
            "verdict": a.verdict,
            "date": a.created_at.isoformat(),
        }
        for a in sorted(attempts, key=lambda x: x.created_at, reverse=True)[:10]
    ]

    return {
        "user": {"name": user.name, "email": user.email, "joined": user.created_at.isoformat()},
        "totals": {
            "analyses": analyses_count,
            "attempts": total,
            "correct": correct,
            "partial": partial,
            "wrong": wrong,
            "accuracy": accuracy,
            "points": round(points, 1),
            "active_days": len(days),
            "streak": streak,
        },
        "level": status["level"],
        "tiers": status["tiers"],
        "by_topic": by_topic,
        "weak_topics": [t["topic"] for t in weak],
        "last7": last7,
        "achievements": achievements,
        "recent": recent,
    }
