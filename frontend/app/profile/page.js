"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL, getToken, logout } from "@/lib/api";

function verdictClass(verdict = "") {
  if (verdict.startsWith("неверно")) return "border-red-500/30 bg-red-500/15 text-red-300";
  if (verdict.startsWith("частично")) return "border-amber-500/30 bg-amber-500/15 text-amber-300";
  return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
}

function barColor(accuracy) {
  if (accuracy >= 80) return "bg-emerald-400";
  if (accuracy >= 60) return "bg-amber-400";
  return "bg-red-400";
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
      } catch (err) {
        setError("Не удалось связаться с сервером. Запущен ли бэкенд?");
      }
    }
    load();
  }, [router]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
          {error}
        </p>
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
    <main className="relative">
      <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 h-[28rem]" />

      <div className="relative mx-auto max-w-5xl px-6 py-10">
        {/* шапка профиля */}
        <section className="card flex flex-wrap items-center gap-5 p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl font-bold text-emerald-300">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">{user.name}</h1>
            <p className="muted truncate text-sm">{user.email}</p>
            <p className="muted mt-1 text-xs">С нами с {formatDate(user.joined)}</p>
          </div>
          <div className="w-full sm:w-64">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{level.name}</span>
              <span className="muted text-xs">{totals.points} баллов</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${Math.round(level.fraction * 100)}%` }}
              />
            </div>
            <p className="muted mt-1 text-xs">
              {level.next_name
                ? `До уровня «${level.next_name}»: ${Math.max(0, level.next_at - totals.points)} б.`
                : "Максимальный уровень"}
            </p>
          </div>
        </section>

        {isEmpty && (
          <section className="card mt-6 p-8 text-center">
            <h2 className="text-xl font-semibold">Здесь появится ваш прогресс</h2>
            <p className="muted mx-auto mt-2 max-w-md text-sm">
              Сделайте первый анализ и решите задания от ИИ-репетитора: баллы, темы и достижения
              будут считаться автоматически.
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

        {/* ключевые показатели */}
        <section className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Анализов" value={totals.analyses} />
          <Kpi label="Ответов на задания" value={totals.attempts} />
          <Kpi label="Точность" value={totals.accuracy === null ? "—" : `${totals.accuracy}%`} />
          <Kpi label="Дней подряд" value={totals.streak} hint={`активных дней: ${totals.active_days}`} />
        </section>

        {/* результаты ответов */}
        {totals.attempts > 0 && (
          <section className="card mt-6 p-5">
            <h2 className="font-semibold">Результаты ответов</h2>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-white/10">
              <div className="bg-emerald-400" style={{ width: `${(totals.correct / totals.attempts) * 100}%` }} />
              <div className="bg-amber-400" style={{ width: `${(totals.partial / totals.attempts) * 100}%` }} />
              <div className="bg-red-400" style={{ width: `${(totals.wrong / totals.attempts) * 100}%` }} />
            </div>
            <div className="muted mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                <span className="text-emerald-400">●</span> верно: {totals.correct}
              </span>
              <span>
                <span className="text-amber-400">●</span> частично: {totals.partial}
              </span>
              <span>
                <span className="text-red-400">●</span> неверно: {totals.wrong}
              </span>
            </div>
          </section>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* темы */}
          <section className="card p-5">
            <h2 className="font-semibold">Успехи по темам</h2>
            {by_topic.length === 0 ? (
              <p className="muted mt-3 text-sm">Ответьте на задания, и здесь появится статистика по темам.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-4">
                {by_topic.map((t) => (
                  <li key={t.topic}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span>{t.topic}</span>
                      <span className="muted text-xs">
                        {t.accuracy}% · ответов: {t.attempts}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${barColor(t.accuracy)}`}
                        style={{ width: `${Math.max(t.accuracy, 3)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {weak_topics.length > 0 && (
              <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <p className="font-semibold text-amber-300">Стоит повторить</p>
                <p className="mt-1 leading-6">{weak_topics.join(", ")}</p>
                <Link href="/agent" className="mt-3 inline-block text-emerald-400 underline">
                  Попросить репетитора объяснить тему
                </Link>
              </div>
            )}
          </section>

          {/* активность */}
          <section className="card p-5">
            <h2 className="font-semibold">Активность за 7 дней</h2>
            <p className="muted mt-1 text-xs">Анализы и ответы на задания</p>
            <div className="mt-5 flex h-40 items-end gap-3">
              {last7.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                  <span className="muted text-xs">{d.count > 0 ? d.count : ""}</span>
                  <div className="flex h-24 w-full items-end">
                    <div
                      className={`w-full rounded-t-md ${d.count > 0 ? "bg-emerald-400" : "bg-white/10"}`}
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
        <section className="card mt-6 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Достижения</h2>
            <span className="muted text-sm">
              {earned} из {achievements.length}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {achievements.map((a) => (
              <div
                key={a.title}
                className={`rounded-xl border p-4 ${
                  a.earned
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-white/10 bg-white/[0.03] opacity-60"
                }`}
              >
                <p className="font-medium">
                  {a.earned ? "🏅" : "🔒"} {a.title}
                </p>
                <p className="muted mt-1 text-xs leading-5">{a.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* последние ответы */}
        <section className="card mt-6 overflow-hidden">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="font-semibold">Последние ответы</h2>
          </div>
          {recent.length === 0 ? (
            <p className="muted p-5 text-sm">Пока нет ответов.</p>
          ) : (
            <ul>
              {recent.map((r, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 px-5 py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6">{r.question}</p>
                    <p className="muted mt-0.5 text-xs">
                      {r.topic} · {formatDate(r.date)}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${verdictClass(r.verdict)}`}>
                    {r.verdict}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="muted mt-6 text-xs">
          Ваши ответы на задания сохраняются только для расчёта прогресса. Баллы: верный ответ 1,
          частично верный 0.5, неверный 0. Дни считаются по времени UTC.
        </p>
      </div>
    </main>
  );
}

function Kpi({ label, value, hint }) {
  return (
    <div className="card p-4 text-center">
      <p className="muted text-xs uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {hint && <p className="muted mt-1 text-xs">{hint}</p>}
    </div>
  );
}
