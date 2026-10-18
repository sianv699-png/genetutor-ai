"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, getToken, logout } from "@/lib/api";

const EXAMPLE_REF = "ATGGTGCACCTGACTCCTGAGGAGAAG";
const EXAMPLE_SAMPLE = "ATGGTGCACCTGACTCCTGTGGAGAAG";

function effectClass(effect = "") {
  if (effect.startsWith("синоним")) return "border-sky-500/30 bg-sky-500/15 text-sky-300";
  if (effect.startsWith("нонсенс") || effect.startsWith("потеря"))
    return "border-red-500/30 bg-red-500/15 text-red-300";
  if (effect.startsWith("миссенс")) return "border-amber-500/30 bg-amber-500/15 text-amber-300";
  return "border-white/10 bg-white/5 text-slate-300";
}

function mlClass(label = "") {
  if (label.includes("патоген")) return "border-red-500/30 bg-red-500/15 text-red-300";
  if (label.includes("нейтраль")) return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
  return "border-white/10 bg-white/5 text-slate-300";
}

function verdictClass(verdict = "") {
  if (verdict.startsWith("неверно")) return "border-red-500/30 bg-red-500/10 text-red-200";
  if (verdict.startsWith("частично")) return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

export default function Analyze() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  const [sequence, setSequence] = useState("");
  const [reference, setReference] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [ai, setAi] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const [shownAnswers, setShownAnswers] = useState({});
  const [answers, setAnswers] = useState({});
  const [checks, setChecks] = useState({});
  const [checking, setChecking] = useState({});
  const [checkErrors, setCheckErrors] = useState({});

  // подстановка кейса со страницы /cases
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("prefill");
      if (raw) {
        const p = JSON.parse(raw);
        setSequence(p.sequence || "");
        setReference(p.reference || "");
        sessionStorage.removeItem("prefill");
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    async function checkUser() {
      const token = getToken();
      if (!token) {
        router.push("/login");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          logout();
          router.push("/login");
          return;
        }
        setUser(await res.json());
      } catch (err) {
        router.push("/login");
      }
    }
    checkUser();
  }, [router]);

  function resetTasks() {
    setShownAnswers({});
    setAnswers({});
    setChecks({});
    setChecking({});
    setCheckErrors({});
  }

  async function handleAnalyze() {
    setError("");
    setResult(null);
    setAi(null);
    setAiError("");
    resetTasks();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ sequence, reference }),
      });
      const data = await res.json();
      if (res.status === 401) {
        logout();
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setError(data.detail || "Ошибка анализа");
        return;
      }
      setResult(data);
    } catch (err) {
      setError("Не удалось связаться с сервером. Запущен ли бэкенд?");
    } finally {
      setLoading(false);
    }
  }

  function fillExample() {
    setReference(EXAMPLE_REF);
    setSequence(EXAMPLE_SAMPLE);
  }

  async function handleExplain() {
    setAiError("");
    setAi(null);
    resetTasks();
    setAiLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/explain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ result }),
      });
      const data = await res.json();
      if (res.status === 401) {
        logout();
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setAiError(data.detail || "Ошибка ИИ");
        return;
      }
      setAi(data);
    } catch (err) {
      setAiError("Не удалось связаться с сервером.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleCheck(i) {
    const task = ai.tasks[i];
    setCheckErrors((p) => ({ ...p, [i]: "" }));
    setChecking((p) => ({ ...p, [i]: true }));
    try {
      const res = await fetch(`${API_URL}/api/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          result,
          question: task.question,
          reference_answer: task.answer,
          student_answer: answers[i] || "",
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        logout();
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setCheckErrors((p) => ({ ...p, [i]: data.detail || "Ошибка проверки" }));
        return;
      }
      setChecks((p) => ({ ...p, [i]: data }));
    } catch (err) {
      setCheckErrors((p) => ({ ...p, [i]: "Не удалось связаться с сервером." }));
    } finally {
      setChecking((p) => ({ ...p, [i]: false }));
    }
  }

  if (!user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <span className="spinner" />
      </main>
    );
  }

  const mutatedPositions = new Set((result?.mutations || []).map((m) => m.position));
  const hasMl = (result?.mutations || []).some((m) => m.ml);

  return (
    <main className="relative">
      <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 h-[28rem]" />

      <div className="relative mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <p className="text-sm text-emerald-400">Здравствуйте, {user.name}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Анализ последовательности</h1>
          <p className="muted mt-2">
            Вставьте последовательность ДНК. Чтобы найти мутации, добавьте эталон той же длины.
          </p>
        </div>

        <section className="card p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="label">Исследуемая последовательность</label>
              <textarea
                className="input mono h-40 resize-y"
                placeholder="ATGGTGCACCTGACT..."
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
              />
              <p className="muted text-xs">Символы A, T, G, C. Можно вставить FASTA.</p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="label">Эталон (необязательно)</label>
              <textarea
                className="input mono h-40 resize-y"
                placeholder="Нормальная последовательность той же длины"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              <p className="muted text-xs">Нужен для поиска мутаций.</p>
            </div>
          </div>

          {error && (
            <p className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleAnalyze}
              disabled={loading || !sequence.trim()}
              className="btn btn-primary"
            >
              {loading ? <span className="spinner" /> : "Анализировать"}
            </button>
            <button onClick={fillExample} className="btn btn-ghost">
              Вставить пример
            </button>
            <button onClick={() => router.push("/cases")} className="btn btn-ghost">
              Выбрать кейс
            </button>
          </div>
        </section>

        {result && (
          <section className="mt-10 flex flex-col gap-6">
            <h2 className="text-xl font-semibold">Результат</h2>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Длина" value={`${result.stats.length} нт`} />
              <Stat label="GC-состав" value={`${result.stats.gc_percent}%`} />
              <Stat label="A / T" value={`${result.stats.counts.A} / ${result.stats.counts.T}`} />
              <Stat label="G / C" value={`${result.stats.counts.G} / ${result.stats.counts.C}`} />
            </div>

            <div className="card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Последовательность</h3>
                <div className="mono flex gap-3 text-xs">
                  {["A", "T", "G", "C"].map((n) => (
                    <span key={n} className={`nt-${n}`}>
                      ● {n}
                    </span>
                  ))}
                  {result.mutations && <span className="text-red-400">● мутация</span>}
                </div>
              </div>
              <p className="mono break-all text-lg leading-8 tracking-wider">
                {result.sequence.split("").map((nt, i) => (
                  <span
                    key={i}
                    className={mutatedPositions.has(i + 1) ? "nt-mut" : `nt-${nt}`}
                    title={`Позиция ${i + 1}`}
                  >
                    {nt}
                  </span>
                ))}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="card p-5">
                <h3 className="mb-3 font-semibold">РНК (транскрипция)</h3>
                <p className="mono break-all text-sm leading-7 text-sky-200">{result.stats.rna}</p>
              </div>
              <div className="card p-5">
                <h3 className="mb-3 font-semibold">Белок (трансляция)</h3>
                <p className="mono break-all text-sm leading-7 text-emerald-200">
                  {result.stats.protein}
                </p>
              </div>
            </div>

            {result.mutations && (
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <h3 className="font-semibold">Найденные мутации</h3>
                  <span className="rounded-full bg-white/10 px-3 py-0.5 text-sm">
                    {result.mutations.length}
                  </span>
                </div>

                {result.mutations.length === 0 ? (
                  <p className="muted p-5">Отличий от эталона нет.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="muted text-xs uppercase tracking-wider">
                          <tr className="border-b border-white/10">
                            <th className="px-5 py-3 font-medium">Позиция</th>
                            <th className="px-5 py-3 font-medium">Замена</th>
                            <th className="px-5 py-3 font-medium">Кодон</th>
                            <th className="px-5 py-3 font-medium">Аминокислота</th>
                            <th className="px-5 py-3 font-medium">Эффект</th>
                            <th className="px-5 py-3 font-medium">ML-ориентир</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.mutations.map((m) => (
                            <tr key={m.position} className="border-b border-white/5 last:border-0">
                              <td className="mono px-5 py-3">{m.position}</td>
                              <td className="mono px-5 py-3">
                                {m.ref} → {m.alt}
                              </td>
                              <td className="mono px-5 py-3">
                                {m.ref_codon ? `${m.ref_codon} → ${m.alt_codon}` : "—"}
                              </td>
                              <td className="mono px-5 py-3">
                                {m.ref_aa ? `${m.ref_aa} → ${m.alt_aa}` : "—"}
                              </td>
                              <td className="px-5 py-3">
                                {m.effect ? (
                                  <span
                                    className={`rounded-full border px-2.5 py-1 text-xs ${effectClass(m.effect)}`}
                                  >
                                    {m.effect}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-5 py-3">
                                {m.ml ? (
                                  <span
                                    className={`rounded-full border px-2.5 py-1 text-xs ${mlClass(m.ml.label)}`}
                                    title={`Оценка модели: ${Math.round(m.ml.probability * 100)}%`}
                                  >
                                    {m.ml.label}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {hasMl && (
                      <p className="muted border-t border-white/10 px-5 py-3 text-xs leading-5">
                        ML-ориентир это оценка учебной модели, обученной на данных ClinVar. Она
                        учитывает только свойства пары аминокислот (качество: ROC AUC около 0.74 на
                        новых генах), не является диагнозом и не заменяет консультацию врача-генетика.
                        Для синонимичных и нонсенс-мутаций оценка не рассчитывается.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="card border-emerald-500/30 bg-emerald-500/[0.04] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-lg">
                    ✨
                  </span>
                  <div>
                    <h3 className="font-semibold">ИИ-репетитор</h3>
                    <p className="muted text-xs">Объяснение, задания и проверка ваших ответов</p>
                  </div>
                </div>
                <button onClick={handleExplain} disabled={aiLoading} className="btn btn-primary">
                  {aiLoading ? (
                    <>
                      <span className="spinner" /> ИИ думает...
                    </>
                  ) : (
                    "Объяснить с помощью ИИ"
                  )}
                </button>
              </div>

              {aiError && (
                <p className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {aiError}
                </p>
              )}

              {ai && (
                <div className="mt-6 flex flex-col gap-6">
                  <div>
                    <h4 className="label mb-2 uppercase tracking-wider">Объяснение</h4>
                    <p className="whitespace-pre-line leading-7">{ai.explanation}</p>
                  </div>

                  <div>
                    <h4 className="label mb-3 uppercase tracking-wider">Задания</h4>
                    <ol className="flex flex-col gap-4">
                      {ai.tasks.map((t, i) => (
                        <li key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="flex gap-3">
                            <span className="mono flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-300">
                              {i + 1}
                            </span>
                            <div className="flex-1">
                              <p className="font-medium leading-6">{t.question}</p>
                              {t.hint && <p className="muted mt-1 text-sm">Подсказка: {t.hint}</p>}

                              <textarea
                                className="input mt-3 h-20 resize-y text-sm"
                                placeholder="Введите ваш ответ..."
                                value={answers[i] || ""}
                                onChange={(e) =>
                                  setAnswers((p) => ({ ...p, [i]: e.target.value }))
                                }
                              />

                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleCheck(i)}
                                  disabled={checking[i] || !(answers[i] || "").trim()}
                                  className="btn btn-primary btn-sm"
                                >
                                  {checking[i] ? <span className="spinner" /> : "Проверить ответ"}
                                </button>
                                <button
                                  onClick={() =>
                                    setShownAnswers((p) => ({ ...p, [i]: !p[i] }))
                                  }
                                  className="btn btn-ghost btn-sm"
                                >
                                  {shownAnswers[i] ? "Скрыть ответ" : "Показать правильный ответ"}
                                </button>
                              </div>

                              {checkErrors[i] && (
                                <p className="mt-3 text-sm text-red-300">{checkErrors[i]}</p>
                              )}

                              {checks[i] && (
                                <div
                                  className={`mt-3 rounded-lg border p-3 text-sm ${verdictClass(checks[i].verdict)}`}
                                >
                                  <p className="font-semibold">{checks[i].verdict}</p>
                                  <p className="mt-1 leading-6">{checks[i].feedback}</p>
                                </div>
                              )}

                              {shownAnswers[i] && (
                                <p className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm leading-6">
                                  <span className="muted">Эталонный ответ: </span>
                                  {t.answer}
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <p className="muted text-xs">
                    Объяснение и оценка ответов сгенерированы ИИ и могут содержать неточности.
                    Проверяйте важные факты по учебнику.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card p-4 text-center">
      <p className="muted text-xs uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
