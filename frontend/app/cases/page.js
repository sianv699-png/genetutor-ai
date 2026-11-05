"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, getToken } from "@/lib/api";
import { CASES, TIERS } from "@/lib/cases";

function typeBadge(type) {
  if (type === "синонимичная") return "badge b-blue";
  if (type === "нонсенс") return "badge b-red";
  return "badge b-amber";
}

export default function Cases() {
  const router = useRouter();
  const [status, setStatus] = useState(null); // null: не вошли или данные ещё грузятся

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/api/case-status`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  }, []);

  const unlocked = status ? status.unlocked : 1;
  const points = status ? status.points : {};
  const passPoints = status ? status.pass_points : 3;
  const maxPoints = status ? status.max_points : 5;
  const detail = (id) => (status ? status.tiers.find((t) => t.id === id) : null);

  function openCase(c) {
    try {
      sessionStorage.setItem(
        "prefill",
        JSON.stringify({ sequence: c.sample, reference: c.reference, caseId: c.id, tier: c.tier })
      );
    } catch {}
    router.push("/analyze");
  }

  return (
    <main className="w-full min-w-0">
      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <span className="science-label">Кейсы / Уровни</span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Учебные кейсы</h1>
        <p className="muted mt-4 max-w-2xl leading-7">
          Кейсы разделены по уровням сложности. Решайте задания, набирайте баллы, проходите кейсы и
          открывайте следующий уровень.
          {!status && " Войдите в аккаунт, чтобы прогресс сохранялся."}
        </p>

        {TIERS.map((tier) => {
          const open = tier.id <= unlocked;
          const list = CASES.filter((c) => c.tier === tier.id);
          const d = detail(tier.id);
          const prev = detail(tier.id - 1);

          return (
            <section key={tier.id} className="mt-14 min-w-0">
              <div className="rule-b flex flex-wrap items-baseline gap-x-4 gap-y-2 pb-4">
                <span className="mono text-sm text-[#A499B3]">{String(tier.id).padStart(2, "0")}</span>
                <h2 className="text-2xl font-bold tracking-tight">{tier.name}</h2>
                <span className="muted text-sm">{tier.audience}</span>
                <span className={open ? "badge b-green" : "badge b-lav"}>
                  {open ? "Открыт" : "Закрыт"}
                </span>
                {open && d && d.need > 0 && (
                  <span className="muted text-sm">
                    Пройдено кейсов: {d.cases_done} из {d.need}
                  </span>
                )}
              </div>

              {!open && tier.id > 1 && (
                <p className="muted mt-3 text-sm">
                  Чтобы открыть, пройдите кейсы уровня «{TIERS[tier.id - 2].name}»
                  {prev ? `: ${prev.cases_done} из ${prev.need}` : ""}.
                </p>
              )}

              {list.length === 0 ? (
                <p className="muted mt-5 text-sm">Кейсы этого уровня в разработке.</p>
              ) : (
                <div className="mt-6 grid min-w-0 gap-5 md:grid-cols-2">
                  {list.map((c) => {
                    const p = points[c.id] || 0;
                    const done = p >= passPoints;
                    return (
                      <article
                        key={c.id}
                        className={`card flex min-w-0 flex-col p-6 ${open ? "" : "opacity-60"}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={typeBadge(c.type)}>{c.type}</span>
                          {done && <span className="badge b-green">Пройден</span>}
                        </div>

                        <h3 className="mt-5 text-xl font-bold leading-snug">{c.title}</h3>
                        <p className="mono mt-1 text-xs text-[#A499B3]">{c.gene}</p>
                        <p className="mt-4 text-sm leading-6">{c.summary}</p>
                        <p className="muted mt-3 text-sm leading-6">{c.details}</p>

                        <div className="tint mt-5 p-4">
                          <p className="label mb-2">На что обратить внимание</p>
                          <ul className="muted list-disc space-y-1 pl-5 text-sm">
                            {c.watch.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="mt-6 flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => openCase(c)}
                            disabled={!open}
                            className="btn btn-primary btn-sm"
                          >
                            {open ? "Открыть в анализе" : "Закрыт"}
                          </button>
                          {status && open && (
                            <span className="muted text-sm">
                              Баллы: {p} из {maxPoints}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        <p className="muted mt-12 text-xs leading-5">
          Кейсы учебные: используются фрагменты (первые 45 кодонов) гена HBB. Информация
          предназначена для обучения и не является медицинской.
        </p>
      </div>
    </main>
  );
}
