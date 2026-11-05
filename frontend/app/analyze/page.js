"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL, getToken, logout } from "@/lib/api";
import { effectBadge, mlBadge, verdictBox, ML_NOTE } from "@/lib/ui";
import MlExplain from "@/components/MlExplain";

const EXAMPLE_REF = "ATGGTGCACCTGACTCCTGAGGAGAAG";
const EXAMPLE_SAMPLE = "ATGGTGCACCTGACTCCTGTGGAGAAG";

const MAX_FILE_BYTES = 2_000_000; // должно совпадать с MAX_FILE_BYTES в backend/analysis.py
const FILE_ACCEPT = ".fa,.fasta,.fna,.ffn,.fas,.seq,.txt,text/plain";

const fmtNum = (n) => Number(n).toLocaleString("ru-RU");

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function FilePicker({ id, file, onChange, onError }) {
  function handle(e) {
    const f = e.target.files?.[0] || null;
    e.target.value = ""; // чтобы можно было выбрать тот же файл повторно
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      onError(`Файл ${f.name} больше ${MAX_FILE_BYTES / 1_000_000} МБ.`);
      return;
    }
    onError("");
    onChange(f);
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label htmlFor={id} className="btn btn-ghost btn-sm cursor-pointer">
        {file ? "Заменить файл" : "Загрузить файл"}
      </label>
      <input id={id} type="file" accept={FILE_ACCEPT} className="sr-only" onChange={handle} />
      {file && (
        <span className="badge b-lav inline-flex min-w-0 max-w-full items-center gap-2">
          <span className="truncate">
            {file.name}, {formatSize(file.size)}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="font-bold leading-none"
            aria-label={`Убрать файл ${file.name}`}
          >
            ×
          </button>
        </span>
      )}
    </div>
  );
}

function SourceNote({ source }) {
  const rows = [
    ["Образец", source.sequence],
    ["Эталон", source.reference],
  ].filter(([, info]) => info);
  if (!rows.length) return null;
  return (
    <div className="card min-w-0 p-4 text-sm leading-6">
      {rows.map(([label, info]) => (
        <p key={label} className="min-w-0 break-words">
          <span className="font-semibold">{label}:</span> файл {info.filename}
          {info.header && <span className="muted"> ({info.header})</span>}
          {info.records > 1 && (
            <span className="muted">. В файле {info.records} записей, для анализа взята первая.</span>
          )}
        </p>
      ))}
    </div>
  );
}

export default function Analyze() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  const [sequence, setSequence] = useState("");
  const [reference, setReference] = useState("");
  const [seqFile, setSeqFile] = useState(null);
  const [refFile, setRefFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [explainFor, setExplainFor] = useState(null);
  const [loading, setLoading] = useState(false);

  const [ai, setAi] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const [shownAnswers, setShownAnswers] = useState({});
  const [answers, setAnswers] = useState({});
  const [checks, setChecks] = useState({});
  const [checking, setChecking] = useState({});
  const [checkErrors, setCheckErrors] = useState({});

  // кейс, из которого пришли (для баллов и уровней)
  const [caseRef, setCaseRef] = useState(null);
  const [resultCaseId, setResultCaseId] = useState("");

  // подстановка кейса со страницы /cases
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("prefill");
      if (raw) {
        const p = JSON.parse(raw);
        setSequence(p.sequence || "");
        setReference(p.reference || "");
        setSeqFile(null);
        setRefFile(null);
        setCaseRef(
          p.caseId
            ? { id: p.caseId, sequence: p.sequence, reference: p.reference, tier: p.tier }
            : null
        );
        sessionStorage.removeItem("prefill");
      }
    } catch {}
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
      } catch {
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
    setExplainFor(null);
    setResult(null);
    setAi(null);
    setAiError("");
    resetTasks();
    setLoading(true);
    const useFiles = Boolean(seqFile || refFile);
    try {
      let res;
      if (useFiles) {
        // образец и эталон можно передать файлом или текстом, в любом сочетании
        const form = new FormData();
        if (seqFile) form.append("sequence_file", seqFile);
        else form.append("sequence_text", sequence);
        if (refFile) form.append("reference_file", refFile);
        else form.append("reference_text", reference);
        res = await fetch(`${API_URL}/api/analyze/file`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: form,
        });
      } else {
        res = await fetch(`${API_URL}/api/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ sequence, reference }),
        });
      }
      const data = await res.json();
      if (res.status === 401) {
        logout();
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setError(typeof data.detail === "string" ? data.detail : "Ошибка анализа");
        return;
      }
      setResult(data);
      setResultCaseId(
        !useFiles &&
          caseRef &&
          sequence.trim() === caseRef.sequence &&
          reference.trim() === caseRef.reference
          ? caseRef.id
          : ""
      );
    } catch {
      setError("Не удалось связаться с сервером. Запущен ли бэкенд?");
    } finally {
      setLoading(false);
    }
  }

  function fillExample() {
    setReference(EXAMPLE_REF);
    setSequence(EXAMPLE_SAMPLE);
    setSeqFile(null);
    setRefFile(null);
    setCaseRef(null);
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
        body: JSON.stringify({ result, tier: caseRef ? caseRef.tier || 0 : 0 }),
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
    } catch {
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
          topic: task.topic || "",
          case_id: resultCaseId,
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
    } catch {
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
  const mutationsTotal = result?.mutations_total ?? result?.mutations?.length ?? 0;

  return (
    <main className="w-full min-w-0">
      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <span className="science-label">01 / Анализ</span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
          Анализ последовательности
        </h1>
        <p className="muted mt-4 max-w-2xl leading-7">
          {user.name}, вставьте последовательность ДНК или загрузите FASTA-файл. Чтобы найти мутации,
          добавьте эталон той же длины.
        </p>

        {/* ввод */}
        <section className="card mt-8 min-w-0 p-5 sm:p-6">
          <div className="grid min-w-0 gap-5 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <label className="label" htmlFor="seq">
                Исследуемая последовательность
              </label>
              <textarea
                id="seq"
                className="input mono h-40 resize-y text-sm disabled:opacity-50"
                placeholder={seqFile ? "Используется загруженный файл" : "ATGGTGCACCTGACT..."}
                value={seqFile ? "" : sequence}
                disabled={Boolean(seqFile)}
                onChange={(e) => setSequence(e.target.value)}
              />
              <FilePicker id="seq-file" file={seqFile} onChange={setSeqFile} onError={setError} />
              <p className="muted text-xs">
                Символы A, T, G, C. Можно вставить FASTA или загрузить файл до 2 МБ (.fasta, .fa, .txt).
              </p>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <label className="label" htmlFor="ref">
                Эталон (необязательно)
              </label>
              <textarea
                id="ref"
                className="input mono h-40 resize-y text-sm disabled:opacity-50"
                placeholder={refFile ? "Используется загруженный файл" : "Нормальная последовательность той же длины"}
                value={refFile ? "" : reference}
                disabled={Boolean(refFile)}
                onChange={(e) => setReference(e.target.value)}
              />
              <FilePicker id="ref-file" file={refFile} onChange={setRefFile} onError={setError} />
              <p className="muted text-xs">Нужен для поиска мутаций.</p>
            </div>
          </div>

          {error && <p className="alert-error mt-5">{error}</p>}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleAnalyze}
              disabled={loading || (!sequence.trim() && !seqFile)}
              className="btn btn-primary"
            >
              {loading ? <span className="spinner" /> : "Анализировать"}
            </button>
            <button onClick={fillExample} className="btn btn-ghost">
              Вставить пример
            </button>
            <Link href="/cases" className="btn btn-ghost">
              Выбрать кейс
            </Link>
          </div>
        </section>

        {result && (
          <section className="mt-12 flex min-w-0 flex-col gap-6">
            <div>
              <span className="science-label">02 / Результат</span>
              <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Что получилось</h2>
            </div>

            {result.source && <SourceNote source={result.source} />}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Длина", `${fmtNum(result.stats.length)} нт`],
                ["GC-состав", `${result.stats.gc_percent}%`],
                ["A / T", `${fmtNum(result.stats.counts.A)} / ${fmtNum(result.stats.counts.T)}`],
                ["G / C", `${fmtNum(result.stats.counts.G)} / ${fmtNum(result.stats.counts.C)}`],
              ].map(([label, value]) => (
                <div key={label} className="card min-w-0 p-4">
                  <p className="text-xl font-bold sm:text-2xl">{value}</p>
                  <p className="muted mt-1 text-xs">{label}</p>
                </div>
              ))}
            </div>

            <div className="panel-ink min-w-0 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="mono text-[10px] text-white/60">DNA SEQUENCE</span>
                <span className="mono flex gap-3 text-[11px]">
                  {["A", "T", "G", "C"].map((n) => (
                    <span key={n} className={`nt-${n}`}>
                      {n}
                    </span>
                  ))}
                  {result.mutations && <span className="text-[#ff8a9a]">мутация</span>}
                </span>
              </div>
              <p className="mono break-all text-base leading-8 tracking-wider sm:text-lg">
                {result.sequence.split("").map((nt, i) => (
                  <span
                    key={i}
                    className={mutatedPositions.has(i + 1) ? "nt-mut" : `nt-${nt}`}
                    title={`Позиция ${i + 1}`}
                  >
                    {nt}
                  </span>
                ))}
                {result.truncated && <span className="text-white/50"> …</span>}
              </p>
            </div>

            {result.truncated && (
              <p className="muted -mt-3 text-xs leading-5">
                Последовательность длинная: здесь показаны первые {fmtNum(result.sequence.length)}{" "}
                нуклеотидов из {fmtNum(result.stats.length)}. Длина, состав и мутации посчитаны по всей
                последовательности, полный список мутаций в таблице ниже.
              </p>
            )}

            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div className="card min-w-0 p-5">
                <p className="label">РНК (транскрипция)</p>
                <p className="mono mt-3 break-all text-sm leading-7">
                  {result.stats.rna}
                  {result.truncated && " …"}
                </p>
              </div>
              <div className="card min-w-0 p-5">
                <p className="label">Белок (трансляция)</p>
                <p className="mono mt-3 break-all text-sm leading-7">
                  {result.stats.protein}
                  {result.truncated && " …"}
                </p>
              </div>
            </div>

            {result.mutations && (
              <div className="card min-w-0 overflow-hidden">
                <div className="rule-b flex items-center justify-between px-5 py-4">
                  <h3 className="font-bold">Найденные мутации</h3>
                  <span className="badge b-lav">{fmtNum(mutationsTotal)}</span>
                </div>

                {result.mutations.length === 0 ? (
                  <p className="muted p-5 text-sm">Отличий от эталона нет.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="rule-b">
                            {["Позиция", "Замена", "Кодон", "Аминокислота", "Эффект", "ML-ориентир"].map(
                              (h) => (
                                <th key={h} className="label px-5 py-3 font-semibold">
                                  {h}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {result.mutations.map((m) => (
                            <tr key={m.position} className="rule-b last:border-0">
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
                                {m.effect ? <span className={effectBadge(m.effect)}>{m.effect}</span> : "—"}
                              </td>
                              <td className="px-5 py-3">
                                {m.ml ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={mlBadge(m.ml.label)}
                                      title={`Оценка нейросети: ${Math.round(m.ml.probability * 100)}%`}
                                    >
                                      {m.ml.label}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExplainFor(explainFor === m.position ? null : m.position)
                                      }
                                      aria-expanded={explainFor === m.position}
                                      className="link text-xs"
                                    >
                                      Почему?
                                    </button>
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {mutationsTotal > result.mutations.length && (
                      <p className="muted rule-t px-5 py-3 text-xs leading-5">
                        Показаны первые {fmtNum(result.mutations.length)} мутаций из {fmtNum(mutationsTotal)}.
                      </p>
                    )}
                    {hasMl && <p className="muted rule-t px-5 py-3 text-xs leading-5">{ML_NOTE}</p>}
                    {explainFor && result.mutations.find((x) => x.position === explainFor) && (
                      <div className="rule-t p-4 sm:p-5">
                        <MlExplain
                          m={result.mutations.find((x) => x.position === explainFor)}
                          onClose={() => setExplainFor(null)}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ИИ-репетитор */}
            <div className="science-panel min-w-0 p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="science-label">03 / ИИ-репетитор</span>
                  <h3 className="mt-3 text-xl font-bold sm:text-2xl">Объяснение и задания</h3>
                  <p className="muted mt-1 text-sm">Проверка ответов и баллы за кейс</p>
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

              {aiError && <p className="alert-error mt-5">{aiError}</p>}

              {ai && (
                <div className="mt-6 flex min-w-0 flex-col gap-6">
                  <div className="card min-w-0 p-5">
                    <p className="label">Объяснение</p>
                    <p className="mt-3 whitespace-pre-line leading-7">{ai.explanation}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="label mb-3">Задания</p>
                    <ol className="flex flex-col gap-4">
                      {ai.tasks.map((t, i) => (
                        <li key={i} className="card min-w-0 p-5">
                          {t.topic && <span className="badge b-lav mb-3">{t.topic}</span>}
                          <p className="font-semibold leading-6">
                            <span className="mono mr-2 text-[#A499B3]">{String(i + 1).padStart(2, "0")}</span>
                            {t.question}
                          </p>
                          {t.hint && <p className="muted mt-2 text-sm">Подсказка: {t.hint}</p>}

                          <textarea
                            className="input mt-4 h-24 resize-y text-sm"
                            placeholder="Введите ваш ответ..."
                            value={answers[i] || ""}
                            onChange={(e) => setAnswers((p) => ({ ...p, [i]: e.target.value }))}
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
                              onClick={() => setShownAnswers((p) => ({ ...p, [i]: !p[i] }))}
                              className="btn btn-ghost btn-sm"
                            >
                              {shownAnswers[i] ? "Скрыть ответ" : "Показать правильный ответ"}
                            </button>
                          </div>

                          {checkErrors[i] && <p className="alert-error mt-3">{checkErrors[i]}</p>}

                          {checks[i] && (
                            <div className={`${verdictBox(checks[i].verdict)} mt-3`}>
                              <p className="font-semibold">{checks[i].verdict}</p>
                              <p className="mt-1 leading-6">{checks[i].feedback}</p>

                              {checks[i].case && (
                                <p className="mt-2 text-xs">
                                  Баллы за кейс: {checks[i].case.points} из {checks[i].case.max_points}
                                  {checks[i].case.completed && ". Кейс пройден."}
                                </p>
                              )}

                              {checks[i].case && checks[i].case.level_up && (
                                <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#2B2D42]">
                                  Новый уровень: {checks[i].case.level_up}. Открыты кейсы следующего
                                  уровня.
                                </p>
                              )}

                              <p className="mt-2 text-xs">
                                Результат учтён в вашем{" "}
                                <Link href="/profile" className="link">
                                  профиле
                                </Link>
                              </p>
                            </div>
                          )}

                          {shownAnswers[i] && (
                            <p className="tint mt-3 p-3 text-sm leading-6">
                              <span className="muted">Эталонный ответ: </span>
                              {t.answer}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>

                  <p className="muted text-xs leading-5">
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