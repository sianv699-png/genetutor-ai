"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL, getToken, logout } from "@/lib/api";
import { verdictBadge } from "@/lib/ui";

function fillClass(accuracy) {
  if (accuracy >= 80) return "fill-good";
  if (accuracy >= 60) return "fill-mid";
  return "fill-bad";
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function weekday(isoDate) {
  return new Date(isoDate + "T00:00:00Z").toLocaleDateString("ru-RU", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export default function Profile() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const token = getToken();
      if (!token) {
        router.push("/login");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/progress`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          logout();
          router.push("/login");
          return;
        }
        if (!res.ok) {
          setError("Не удалось загрузить профиль");
          return;
        }
        setData(await res.json());
      } catch {
        setError("Не удалось связаться с сервером. Запущен ли бэкенд?");
      }
    }
    load();
  }, [router]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="alert-error">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <span className="spinner" />
      </main>
    );
  }

  const { user, totals, level, by_topic, weak_topics, last7, achievements, recent } = data;
  const maxDay = Math.max(1, ...last7.map((d) => d.count));
  const isEmpty = totals.attempts === 0 && totals.analyses === 0;
  const earned = achievements.filter((a) => a.earned).length;

  return (
    <main className="w-full min-w-0">
      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <span className="science-label">Профиль</span>

        {/* шапка профиля */}
        <section className="card mt-5 flex min-w-0 flex-wrap items-center gap-5 p-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#2B2D42] text-2xl font-bold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">{user.name}</h1>
            <p className="muted truncate text-sm">{user.email}</p>
            <p className="muted mt-1 text-xs">С нами с {formatDate(user.joined)}</p>
          </div>
          <div className="w-full sm:w-72">
            <div className="flex items-baseline justify-between">
              <span className="font-bold">{level.name}</span>
              <span className="muted text-xs">{totals.points} баллов</span>
            </div>
            <div className="track mt-2">
              <div
                className="fill-ink h-full rounded-full"
                style={{ width: `${Math.round(level.fraction * 100)}%` }}
              />
            </div>
            <p className="muted mt-1.5 text-xs leading-5">
              {level.next_name
                ? `Кейсы уровня «${level.name}»: пройдено ${level.cases_done} из ${level.cases_needed}, дальше «${level.next_name}»`
                : "Максимальный уровень"}
            </p>
          </div>
        </section>

        {isEmpty && (
          <section className="science-panel mt-6 p-8 text-center">
            <h2 className="text-xl font-bold">Здесь появится ваш прогресс</h2>
            <p className="muted mx-auto mt-2 max-w-md text-sm leading-6">
              Сделайте первый анализ и решите задания от ИИ-репетитора: баллы, темы и достижения будут
              считаться автоматически.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/cases" className="btn btn-primary">
                Выбрать кейс
              </Link>
              <Link href="/analyze" className="btn btn-ghost">
                Перейти к анализу
              </Link>
            </div>
          </section>
        )}

        {/* показатели */}
        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Анализов", totals.analyses, ""],
            ["Ответов на задания", totals.attempts, ""],
            ["Точность", totals.accuracy === null ? "—" : `${totals.accuracy}%`, ""],
            ["Дней подряд", totals.streak, `активных дней: ${totals.active_days}`],
          ].map(([label, value, hint]) => (
            <div key={label} className="card min-w-0 p-4">
              <p className="text-3xl font-bold">{value}</p>
              <p className="muted mt-1 text-xs">{label}</p>
              {hint && <p className="muted mt-0.5 text-[11px]">{hint}</p>}
            </div>
          ))}
        </section>

        {totals.attempts > 0 && (
          <section className="card mt-6 p-5">
            <h2 className="font-bold">Результаты ответов</h2>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[#ece4e3]">
              <div className="fill-good" style={{ width: `${(totals.correct / totals.attempts) * 100}%` }} />
              <div className="fill-mid" style={{ width: `${(totals.partial / totals.attempts) * 100}%` }} />
              <div className="fill-bad" style={{ width: `${(totals.wrong / totals.attempts) * 100}%` }} />
            </div>
            <div className="muted mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                <span className="text-[#1f7a4d]">●</span> верно: {totals.correct}
              </span>
              <span>
                <span className="text-[#c98a00]">●</span> частично: {totals.partial}
              </span>
              <span>
                <span className="text-[#d80032]">●</span> неверно: {totals.wrong}
              </span>
            </div>
          </section>
        )}

        <div className="mt-6 grid min-w-0 gap-6 md:grid-cols-2">
          {/* темы */}
          <section className="card min-w-0 p-5">
            <h2 className="font-bold">Успехи по темам</h2>
            {by_topic.length === 0 ? (
              <p className="muted mt-3 text-sm">Ответьте на задания, и здесь появится статистика по темам.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-4">
                {by_topic.map((t) => (
                  <li key={t.topic}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{t.topic}</span>
                      <span className="muted shrink-0 text-xs">
                        {t.accuracy}%, ответов: {t.attempts}
                      </span>
                    </div>
                    <div className="track mt-1.5">
                      <div
                        className={`${fillClass(t.accuracy)} h-full rounded-full`}
                        style={{ width: `${Math.max(t.accuracy, 3)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {weak_topics.length > 0 && (
              <div className="tint mt-5 p-4 text-sm">
                <p className="font-bold">Стоит повторить</p>
                <p className="mt-1 leading-6">{weak_topics.join(", ")}</p>
                <Link href="/agent" className="link mt-3 inline-block">
                  Попросить репетитора объяснить тему
                </Link>
              </div>
            )}
          </section>

          {/* активность */}
          <section className="card min-w-0 p-5">
            <h2 className="font-bold">Активность за 7 дней</h2>
            <p className="muted mt-1 text-xs">Анализы и ответы на задания</p>
            <div className="mt-5 flex h-40 items-end gap-3">
              {last7.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                  <span className="muted h-4 text-xs">{d.count > 0 ? d.count : ""}</span>
                  <div className="flex h-24 w-full items-end">
                    <div
                      className={`w-full rounded-t-md ${d.count > 0 ? "fill-ink" : "bg-[#ece4e3]"}`}
                      style={{ height: `${d.count > 0 ? Math.max((d.count / maxDay) * 100, 8) : 4}%` }}
                    />
                  </div>
                  <span className="muted text-xs">{weekday(d.date)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* достижения */}
        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold">Достижения</h2>
            <span className="muted text-sm">
              {earned} из {achievements.length}
            </span>
          </div>
          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {achievements.map((a) => (
              <div
                key={a.title}
                className={`flex gap-3 rounded-2xl border p-4 ${
                  a.earned ? "border-[#2B2D42]/25 bg-white" : "border-[#2B2D42]/10 bg-transparent opacity-60"
                }`}
              >
                <span className={`medal ${a.earned ? "medal-on" : "medal-off"}`}>{a.earned ? "✓" : ""}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="muted mt-1 text-xs leading-5">{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* последние ответы */}
        <section className="card mt-6 overflow-hidden">
          <div className="rule-b px-5 py-4">
            <h2 className="font-bold">Последние ответы</h2>
          </div>
          {recent.length === 0 ? (
            <p className="muted p-5 text-sm">Пока нет ответов.</p>
          ) : (
            <ul>
              {recent.map((r, i) => (
                <li
                  key={i}
                  className="rule-b flex flex-wrap items-start justify-between gap-3 px-5 py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6">{r.question}</p>
                    <p className="muted mt-0.5 text-xs">
                      {r.topic}, {formatDate(r.date)}
                    </p>
                  </div>
                  <span className={verdictBadge(r.verdict)}>{r.verdict}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="muted mt-6 text-xs leading-5">
          Ваши ответы на задания сохраняются только для расчёта прогресса. Баллы: верный ответ 1,
          частично верный 0.5, неверный 0. Дни считаются по времени UTC.
        </p>
      </div>
    </main>
  );
}
