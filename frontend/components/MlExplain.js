"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

const TITLES = {
  charge: "Заряд",
  volume: "Размер (объём)",
  hydropathy: "Гидрофобность",
  substitution: "Типичность замены",
  residue: "Особые свойства остатков",
};

const FLAG_TEXT = {
  to_pro: "в белок встраивается пролин",
  from_pro: "теряется пролин",
  to_gly: "в белок встраивается глицин",
  from_gly: "теряется глицин",
  to_cys: "появляется цистеин",
  from_cys: "теряется цистеин",
  aromatic_change: "меняется ароматичность",
};

const fmtSigned = (n, digits = 0) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;
const chargeWord = (c) => (c > 0 ? "положительный" : c < 0 ? "отрицательный" : "нейтральный");
const hydroWord = (h) => (h > 0 ? "гидрофобная" : "гидрофильная");

function describe(key, p) {
  if (key === "charge") {
    const { ref, alt } = p.charge;
    return ref === alt
      ? `заряд не меняется (${chargeWord(ref)})`
      : `заряд меняется: ${chargeWord(ref)} → ${chargeWord(alt)}`;
  }
  if (key === "volume") {
    const { ref, alt } = p.volume;
    const d = alt - ref;
    const size = Math.abs(d) < 20 ? "почти не меняется" : Math.abs(d) < 40 ? "меняется заметно" : "меняется сильно";
    return `${ref.toFixed(0)} → ${alt.toFixed(0)} Å³ (${fmtSigned(d)}), размер ${size}`;
  }
  if (key === "hydropathy") {
    const { ref, alt } = p.hydropathy;
    const d = alt - ref;
    const flip = ref > 0 !== alt > 0;
    const text = flip
      ? `из ${hydroWord(ref)} в ${hydroWord(alt)}`
      : `остаётся ${hydroWord(ref)}, сдвиг ${fmtSigned(d, 1)}`;
    return `${ref.toFixed(1)} → ${alt.toFixed(1)}: ${text}`;
  }
  if (key === "substitution") {
    const b = p.blosum62;
    const word = b >= 1 ? "частая в эволюции замена" : b >= -1 ? "умеренно редкая замена" : "редкая в эволюции замена";
    return `оценка BLOSUM62: ${b}, ${word}`;
  }
  if (key === "residue") {
    return p.special.length ? p.special.map((f) => FLAG_TEXT[f]).join(", ") : "особых свойств (Pro, Gly, Cys) нет";
  }
  return "";
}

function ImpactBar({ impact }) {
  const width = Math.min(Math.abs(impact) / 0.25, 1) * 50;
  const positive = impact > 0;
  return (
    <div className="relative h-2 w-full rounded-full bg-[#ece4e3]" aria-hidden="true">
      <div className="absolute left-1/2 top-[-2px] h-3 w-px bg-[#2B2D42]/40" />
      {Math.abs(impact) >= 0.005 && (
        <div
          className={`absolute top-0 h-2 rounded-full ${positive ? "bg-[#d80032]" : "bg-[#1f7a4d]"}`}
          style={positive ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
        />
      )}
    </div>
  );
}

function impactLabel(impact) {
  const pp = Math.round(impact * 100);
  if (Math.abs(pp) < 2) return "почти не влияет";
  return `${pp > 0 ? "повышает" : "снижает"} на ${Math.abs(pp)} п.п.`;
}

export default function MlExplain({ m, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/ml/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ref_aa: m.ref_aa,
            alt_aa: m.alt_aa,
            nt_ref: m.ref,
            nt_alt: m.alt,
            codon_pos: (m.position - 1) % 3 + 1,
          }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.detail || "Не удалось получить объяснение");
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) setError("Не удалось связаться с сервером.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [m.ref_aa, m.alt_aa, m.ref, m.alt, m.position]);

  const strong = data ? data.factors.filter((f) => Math.abs(f.impact) >= 0.03) : [];
  const up = strong.filter((f) => f.impact > 0).map((f) => TITLES[f.key].toLowerCase());
  const down = strong.filter((f) => f.impact < 0).map((f) => TITLES[f.key].toLowerCase());

  return (
    <div className="tint min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">
            Почему такая оценка: {m.ref_aa} → {m.alt_aa}
          </p>
          <p className="muted mt-1 text-xs">Какие свойства замены сдвинули оценку модели</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
            Скрыть
          </button>
        )}
      </div>

      {error && <p className="alert-error mt-4">{error}</p>}
      {!data && !error && (
        <p className="muted mt-4 flex items-center gap-2 text-sm">
          <span className="spinner" /> Считаю вклад свойств...
        </p>
      )}

      {data && (
        <div className="mt-4 min-w-0">
          <p className="text-sm leading-6">
            Оценка модели: <span className="font-bold">{Math.round(data.probability * 100)}%</span>
            {" "}({data.label}). Для типичной замены модель дала бы около{" "}
            <span className="font-bold">{Math.round(data.typical_probability * 100)}%</span>.{" "}
            {strong.length === 0
              ? "Ни одно свойство по отдельности не сдвигает оценку заметно."
              : `${up.length ? `Сильнее всего повышает: ${up.join(", ")}. ` : ""}${
                  down.length ? `Снижает: ${down.join(", ")}.` : ""
                }`}
          </p>

          <ul className="mt-4 flex flex-col gap-4">
            {data.factors.map((f) => (
              <li key={f.key} className="grid min-w-0 gap-2 sm:grid-cols-[1fr_14rem] sm:items-center sm:gap-5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{TITLES[f.key]}</p>
                  <p className="muted text-xs leading-5">{describe(f.key, data.properties)}</p>
                </div>
                <div className="min-w-0">
                  <ImpactBar impact={f.impact} />
                  <p className="muted mt-1 text-right text-[11px]">{impactLabel(f.impact)}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="muted mt-4 text-xs leading-5">
            Красная часть полосы вправо означает, что свойство повышает оценку по сравнению с типичной
            заменой, зелёная влево означает, что снижает. Вклады считаются отдельно для каждого
            свойства и в сумме не равны итоговой оценке. Это пояснение к учебной модели, а не причина
            болезни и не диагноз.
          </p>
        </div>
      )}
    </div>
  );
}
