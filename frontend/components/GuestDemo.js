"use client";

import { useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { effectBadge, mlBadge } from "@/lib/ui";
import MlExplain from "@/components/MlExplain";

const REF = "ATGGTGCACCTGACTCCTGAGGAGAAG";

const EXAMPLES = [
  { id: "sickle", title: "Серповидноклеточная анемия", note: "E → V, миссенс", sample: "ATGGTGCACCTGACTCCTGTGGAGAAG" },
  { id: "hbc", title: "Гемоглобин C", note: "E → K, миссенс", sample: "ATGGTGCACCTGACTCCTAAGGAGAAG" },
  { id: "silent", title: "Молчащая замена", note: "E → E, синонимичная", sample: "ATGGTGCACCTGACTCCTGAAGAGAAG" },
  { id: "stop", title: "Учебная нонсенс-замена", note: "E → стоп-кодон", sample: "ATGGTGCACCTGACTCCTTAGGAGAAG" },
];

export default function GuestDemo() {
  const [example, setExample] = useState(EXAMPLES[0].id);
  const [sequence, setSequence] = useState(EXAMPLES[0].sample);
  const [reference, setReference] = useState(REF);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [explainFor, setExplainFor] = useState(null);

  function pick(ex) {
    setExample(ex.id);
    setSequence(ex.sample);
    setReference(REF);
    setResult(null);
    setError("");
  }

  async function run() {
    setError("");
    setResult(null);
    setExplainFor(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/guest/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence, reference }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Не удалось выполнить анализ");
        return;
      }
      setResult(data);
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  const mutated = new Set((result?.mutations || []).map((m) => m.position));

  return (
    <section
      id="try"
      className="mx-auto w-full max-w-7xl min-w-0 px-5 py-20 sm:px-8 sm:py-24 lg:px-10"
    >
      <span className="science-label">Попробуйте сразу</span>

      <div className="mt-5 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
          Разбор мутации
          <br />
          без регистрации.
        </h2>

        <p className="muted max-w-md text-sm leading-7 sm:text-base">
          Выберите пример или вставьте свою последовательность. Расчёты выполняет проверенный код,
          результат нигде не сохраняется.
        </p>
      </div>

      <div className="science-panel mt-10 min-w-0 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Примеры">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => pick(ex)}
              aria-pressed={example === ex.id}
              className={`rounded-full border px-4 py-2 text-left text-sm transition-colors ${
                example === ex.id
                  ? "border-[#2B2D42] bg-[#2B2D42] text-white"
                  : "border-[#2B2D42]/15 bg-white hover:border-[#2B2D42]/40"
              }`}
            >
              <span className="font-semibold">{ex.title}</span>
              <span className={`ml-2 text-xs ${example === ex.id ? "text-white/70" : "muted"}`}>
                {ex.note}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <label className="label" htmlFor="guest-seq">
              Исследуемая последовательность
            </label>
            <textarea
              id="guest-seq"
              className="input mono h-28 resize-y text-sm"
              value={sequence}
              onChange={(e) => setSequence(e.target.value)}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="label" htmlFor="guest-ref">
              Эталон (нормальная последовательность)
            </label>
            <textarea
              id="guest-ref"
              className="input mono h-28 resize-y text-sm"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="alert-error mt-4">{error}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={loading || !sequence.trim()}
            className="btn btn-primary"
          >
            {loading ? <span className="spinner" /> : "Разобрать"}
          </button>
          <span className="muted text-xs">До 600 нуклеотидов, без ИИ-объяснения</span>
        </div>

        {result && (
          <div className="mt-8 min-w-0">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                ["Длина", `${result.stats.length} нт`],
                ["GC-состав", `${result.stats.gc_percent}%`],
                ["Отличия", result.mutations ? result.mutations.length : "—"],
              ].map(([label, value]) => (
                <div key={label} className="card min-w-0 p-3 sm:p-4">
                  <p className="text-lg font-bold sm:text-2xl">{value}</p>
                  <p className="muted mt-1 text-[11px] sm:text-xs">{label}</p>
                </div>
              ))}
            </div>

            <div className="panel-ink mt-4 min-w-0 p-4">
              <p className="mono mb-3 text-[10px] text-white/60">DNA SEQUENCE</p>
              <p className="mono break-all text-sm leading-8 tracking-wider sm:text-base">
                {result.sequence.split("").map((nt, i) => (
                  <span
                    key={i}
                    className={mutated.has(i + 1) ? "nt-mut" : `nt-${nt}`}
                    title={`Позиция ${i + 1}`}
                  >
                    {nt}
                  </span>
                ))}
              </p>
            </div>

            {result.mutations && result.mutations.length === 0 && (
              <p className="muted mt-4 text-sm">Отличий от эталона нет.</p>
            )}

            {result.mutations && result.mutations.length > 0 && (
              <ul className="mt-4 flex flex-col gap-3">
                {result.mutations.map((m) => (
                  <li key={m.position} className="card min-w-0 p-4">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <span className="mono text-sm font-bold">
                      {m.ref} → {m.alt}
                      <span className="muted ml-2 font-normal">позиция {m.position}</span>
                    </span>
                    {m.ref_codon && (
                      <span className="mono text-sm">
                        {m.ref_codon} → {m.alt_codon}
                      </span>
                    )}
                    {m.ref_aa && (
                      <span className="mono text-sm">
                        {m.ref_aa} → {m.alt_aa}
                      </span>
                    )}
                    {m.effect && <span className={effectBadge(m.effect)}>{m.effect}</span>}
                    {m.ml && (
                      <span
                        className={mlBadge(m.ml.label)}
                        title={`Оценка модели: ${Math.round(m.ml.probability * 100)}%`}
                      >
                        ML: {m.ml.label}
                      </span>
                    )}
                    {m.ml && (
                      <button
                        type="button"
                        onClick={() => setExplainFor(explainFor === m.position ? null : m.position)}
                        aria-expanded={explainFor === m.position}
                        className="link text-xs"
                      >
                        Почему такая оценка?
                      </button>
                    )}
                    </div>
                    {explainFor === m.position && (
                      <div className="mt-4">
                        <MlExplain m={m} onClose={() => setExplainFor(null)} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-[#2B2D42]/10 bg-white p-5 sm:flex-row sm:items-center">
              <p className="max-w-xl text-sm leading-6">
                Это только расчёт. ИИ-репетитор объяснит результат простым языком, составит задания и
                проверит ваши ответы, а прогресс сохранится в профиле.
              </p>
              <div className="flex shrink-0 flex-wrap gap-3">
                <Link href="/register" className="btn btn-primary btn-sm">
                  Создать аккаунт
                </Link>
                <Link href="/login" className="btn btn-ghost btn-sm">
                  Войти
                </Link>
              </div>
            </div>

            <p className="muted mt-4 text-xs leading-5">
              ML-ориентир — оценка учебной модели, не диагноз.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
