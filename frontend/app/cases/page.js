"use client";

import { useRouter } from "next/navigation";
import { CASES } from "@/lib/cases";

function typeClass(type) {
  if (type === "синонимичная") return "border-sky-500/30 bg-sky-500/15 text-sky-300";
  if (type === "нонсенс") return "border-red-500/30 bg-red-500/15 text-red-300";
  return "border-amber-500/30 bg-amber-500/15 text-amber-300";
}

export default function Cases() {
  const router = useRouter();

  function openInAnalysis(c) {
    try {
      sessionStorage.setItem(
        "prefill",
        JSON.stringify({ sequence: c.sample, reference: c.reference })
      );
    } catch (e) {}
    router.push("/analyze");
  }

  return (
    <main className="relative">
      <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 h-[28rem]" />

      <div className="relative mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Учебные кейсы</h1>
          <p className="muted mt-2 max-w-2xl">
            Готовые примеры мутаций. Откройте кейс в анализе, изучите результат и решите
            задания от ИИ-репетитора.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {CASES.map((c) => (
            <div key={c.id} className="card flex flex-col p-6 transition hover:border-emerald-500/30">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-xs ${typeClass(c.type)}`}>
                  {c.type}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs muted">
                  {c.level}
                </span>
              </div>

              <h2 className="mt-4 text-xl font-semibold">{c.title}</h2>
              <p className="mono mt-1 text-xs muted">{c.gene}</p>
              <p className="mt-3 text-sm leading-6">{c.summary}</p>
              <p className="muted mt-3 text-sm leading-6">{c.details}</p>

              <div className="mt-4">
                <p className="label mb-1 uppercase tracking-wider">На что обратить внимание</p>
                <ul className="muted list-disc space-y-1 pl-5 text-sm">
                  {c.watch.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>

              <button onClick={() => openInAnalysis(c)} className="btn btn-primary mt-6 self-start">
                Открыть в анализе
              </button>
            </div>
          ))}
        </div>

        <p className="muted mt-8 text-xs">
          Кейсы учебные: используются фрагменты (первые 45 кодонов) гена HBB. Информация
          предназначена для обучения и не является медицинской.
        </p>
      </div>
    </main>
  );
}