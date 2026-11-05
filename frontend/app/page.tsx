import Link from "next/link";
import GuestDemo from "../components/GuestDemo";

/* =========================
   DEMO DATA
========================= */

const DEMO_SEQ = "ATGGTGCACCTGACTCCTGTGGAGAAG";
const MUT_INDEX = 19;

const STEPS = [
  {
    number: "01",
    title: "Загрузите ДНК",
    description:
      "Вставьте последовательность ДНК или загрузите FASTA-файл для исследования.",
  },
  {
    number: "02",
    title: "Изучите результат",
    description:
      "Получите информацию о нуклеотидах, характеристиках последовательности и найденных отличиях.",
  },
  {
    number: "03",
    title: "Закрепите знания",
    description:
      "Изучите объяснения ИИ-репетитора и проверьте себя с помощью заданий.",
  },
];

const FEATURES = [
  {
    number: "01",
    icon: "⌘",
    title: "Анализ ДНК",
    description:
      "Длина последовательности, GC-состав, частота нуклеотидов, транскрипция в РНК и трансляция в белок.",
    background: "bg-white",
  },
  {
    number: "02",
    icon: "✳",
    title: "Поиск мутаций",
    description:
      "Сравнение с эталоном, подсветка отличий и определение возможного типа мутации.",
    background: "bg-[#F5E9E8]",
  },
  {
    number: "03",
    icon: "✦",
    title: "ИИ-репетитор",
    description:
      "Понятные объяснения генетических процессов и задания для самостоятельной проверки знаний.",
    background: "bg-[#F0EAF5]",
  },
];

/* =========================
   DNA SEQUENCE
========================= */

function DNASequence() {
  return (
    <div className="mono break-all text-sm leading-8 tracking-wider sm:text-base">
      {DEMO_SEQ.split("").map((nt, index) => (
        <span
          key={`${nt}-${index}`}
          className={
            index === MUT_INDEX
              ? "nt-mut"
              : `nt-${nt}`
          }
        >
          {nt}
        </span>
      ))}
    </div>
  );
}

/* =========================
   DNA HELIX
========================= */

function DNAHelix() {
  const points = Array.from({ length: 13 }, (_, index) => {
    const angle = index * 0.65;

    return {
      y: 20 + index * 19,
      x1: 100 + Math.sin(angle) * 42,
      x2: 100 - Math.sin(angle) * 42,
    };
  });

  return (
    <svg
      viewBox="0 0 200 270"
      className="block h-auto w-full max-w-[200px]"
      fill="none"
      role="img"
      aria-label="Иллюстрация двойной спирали ДНК"
    >
      {points.slice(0, -1).map((point, index) => {
        const next = points[index + 1];

        return (
          <g key={index}>
            <path
              d={`M ${point.x1} ${point.y} L ${next.x1} ${next.y}`}
              stroke="#A499B3"
              strokeWidth="4"
              strokeLinecap="round"
            />

            <path
              d={`M ${point.x2} ${point.y} L ${next.x2} ${next.y}`}
              stroke="#EF233C"
              strokeWidth="4"
              strokeLinecap="round"
            />

            <line
              x1={point.x1}
              y1={point.y}
              x2={point.x2}
              y2={point.y}
              stroke="#A499B3"
              strokeWidth="2"
              opacity="0.7"
            />
          </g>
        );
      })}

      {points.map((point, index) => (
        <g key={`dot-${index}`}>
          <circle
            cx={point.x1}
            cy={point.y}
            r="4"
            fill="#A499B3"
          />

          <circle
            cx={point.x2}
            cy={point.y}
            r="4"
            fill="#EF233C"
          />
        </g>
      ))}
    </svg>
  );
}

/* =========================
   DNA PREVIEW CARD
========================= */

function DNAAnalysisPreview() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-[520px]">

      <div className="science-panel min-w-0 overflow-hidden p-4 sm:p-6">

        {/* Header */}

        <div className="flex flex-wrap items-center justify-between gap-3">

          <div>
            <p className="science-label">
              GeneTutor laboratory
            </p>

            <p className="mt-1 text-sm font-semibold">
              Пример исследования
            </p>
          </div>

          <span className="rounded-full border border-[#A499B3]/40 px-3 py-1 text-xs text-[#777587]">
            DEMO / 001
          </span>

        </div>

        {/* Illustration */}

        <div className="mt-5 grid min-w-0 grid-cols-1 items-center gap-4 rounded-2xl border border-[#2B2D42]/10 bg-white p-4 sm:grid-cols-2">

          <div className="min-w-0">

            <p className="science-label">
              Structure
            </p>

            <h3 className="mt-3 text-xl font-bold leading-snug">
              Двойная
              <br />
              спираль ДНК
            </h3>

            <p className="muted mt-3 text-sm leading-6">
              Последовательность нуклеотидов
              хранит генетическую информацию.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ["A", "#26966A"],
                ["T", "#EF233C"],
                ["G", "#BC852C"],
                ["C", "#7770C8"],
              ].map(([letter, color]) => (
                <span
                  key={letter}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF9F7] text-sm font-bold"
                  style={{ color }}
                >
                  {letter}
                </span>
              ))}
            </div>

          </div>

          <div className="flex items-center justify-center">
            <DNAHelix />
          </div>

        </div>

        {/* Statistics */}

        <div className="mt-4 grid grid-cols-3 gap-2">

          {[
            { label: "Длина", value: "27 нт" },
            { label: "GC-состав", value: "55.56%" },
            { label: "Отличия", value: "1" },
          ].map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-xl border border-[#2B2D42]/10 bg-white p-3"
            >
              <p className="text-base font-bold sm:text-xl">
                {item.value}
              </p>

              <p className="muted mt-1 text-[10px] sm:text-xs">
                {item.label}
              </p>
            </div>
          ))}

        </div>

        {/* Sequence */}

        <div className="mt-4 min-w-0 rounded-2xl bg-[#2B2D42] p-4 text-white">

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="mono text-[10px] text-white/60">
              DNA SEQUENCE
            </span>

            <span className="text-[10px] text-[#F0B4C4]">
              5&apos; → 3&apos;
            </span>
          </div>

          <DNASequence />

        </div>

        {/* Mutation */}

        <div className="mt-4 rounded-2xl border border-[#EF233C]/20 bg-white p-4">

          <div className="flex flex-wrap items-center gap-3">

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5E9E8] text-xl text-[#D80032]">
              !
            </div>

            <div className="min-w-0 flex-1">
              <p className="muted text-xs">
                Пример изменения
              </p>

              <p className="mono mt-1 text-sm font-bold">
                GAG → GTG
              </p>
            </div>

            <span className="rounded-full bg-[#F5E9E8] px-3 py-1 text-xs font-semibold text-[#D80032]">
              Missense
            </span>

          </div>

          <p className="muted mt-3 text-xs leading-5">
            Демонстрационный пример замены кодона.
            Биологическое значение зависит от контекста
            последовательности.
          </p>

        </div>

      </div>

    </div>
  );
}

/* =========================
   HOME PAGE
========================= */

export default function Home() {
  return (
    <main className="w-full min-w-0 bg-[#FFF9F7] text-[#2B2D42]">

      {/* =====================
          HERO
      ===================== */}

      <section className="w-full border-b border-[#2B2D42]/10">

        <div className="mx-auto grid w-full max-w-7xl min-w-0 grid-cols-1 items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:px-10 lg:py-24">

          {/* Left content */}

          <div className="min-w-0">

            <span className="science-label">
              Your personal biology lab
            </span>

            <h1 className="mt-7 text-5xl font-bold leading-[1.08] tracking-[-0.06em] sm:text-6xl lg:text-7xl">

              Изучай
              <br />

              язык
              <br />

              <span className="font-serif font-normal italic text-[#D80032]">
                генетики.
              </span>

            </h1>

            <p className="muted mt-7 max-w-lg text-base leading-8 sm:text-lg">
              Исследуй последовательности ДНК,
              разбирайся в генетических мутациях
              и изучай сложные процессы с помощью
              ИИ-репетитора.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">

              <Link
                href="/analyze"
                className="btn btn-primary"
              >
                Начать анализ <span aria-hidden="true">↗</span>
              </Link>

              <Link
                href="/cases"
                className="btn btn-ghost"
              >
                Учебные кейсы
              </Link>

            </div>

            <div className="mt-12 grid max-w-md grid-cols-3 gap-4 border-t border-[#2B2D42]/10 pt-6">

              <div>
                <p className="mono text-xs text-[#A499B3]">
                  01
                </p>

                <p className="mt-2 text-xs font-semibold sm:text-sm">
                  Исследуй
                </p>
              </div>

              <div>
                <p className="mono text-xs text-[#A499B3]">
                  02
                </p>

                <p className="mt-2 text-xs font-semibold sm:text-sm">
                  Понимай
                </p>
              </div>

              <div>
                <p className="mono text-xs text-[#A499B3]">
                  03
                </p>

                <p className="mt-2 text-xs font-semibold sm:text-sm">
                  Обучайся
                </p>
              </div>

            </div>

          </div>

          {/* Right preview */}

          <div className="w-full min-w-0">
            <DNAAnalysisPreview />
          </div>

        </div>

      </section>

      {/* =====================
          GUEST ANALYSIS
          (разбор мутации без регистрации)
      ===================== */}

      <GuestDemo />

      {/* =====================
          FEATURES
      ===================== */}

      <section className="mx-auto w-full max-w-7xl min-w-0 px-5 py-20 sm:px-8 sm:py-24 lg:px-10">

        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">

          <div>
            <span className="science-label">
              01 / Platform
            </span>

            <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
              Инструменты
              <br />
              для открытий.
            </h2>
          </div>

          <p className="muted max-w-md text-sm leading-7 sm:text-base">
            От анализа последовательности до
            объяснения результата — всё необходимое
            для обучения в одном месте.
          </p>

        </div>

        <div className="mt-10 grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3">

          {FEATURES.map((feature) => (
            <article
              key={feature.number}
              className={`card min-w-0 p-6 sm:p-8 ${feature.background}`}
            >

              <div className="flex items-center justify-between gap-3">

                <span className="mono text-xs text-[#A499B3]">
                  FEATURE / {feature.number}
                </span>

                <span className="text-2xl text-[#D80032]">
                  {feature.icon}
                </span>

              </div>

              <h3 className="mt-10 text-xl font-bold sm:text-2xl">
                {feature.title}
              </h3>

              <p className="muted mt-4 text-sm leading-7">
                {feature.description}
              </p>

            </article>
          ))}

        </div>

      </section>

      {/* =====================
          HOW IT WORKS
      ===================== */}

      <section
        id="how-it-works"
        className="w-full border-y border-[#2B2D42]/10 bg-[#EDF2F4]"
      >

        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10">

          <span className="science-label">
            02 / Workflow
          </span>

          <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
            Три шага к пониманию.
          </h2>

          <div className="mt-10 grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3">

            {STEPS.map((step) => (
              <article
                key={step.number}
                className="card min-w-0 p-6 sm:p-8"
              >

                <span className="mono text-4xl font-bold text-[#A499B3]">
                  {step.number}
                </span>

                <div className="my-7 h-px w-full bg-[#2B2D42]/10" />

                <h3 className="text-xl font-bold">
                  {step.title}
                </h3>

                <p className="muted mt-3 text-sm leading-7">
                  {step.description}
                </p>

              </article>
            ))}

          </div>

        </div>

      </section>

      {/* =====================
          CTA
      ===================== */}

      <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10">

        <div className="rounded-3xl border border-[#2B2D42]/10 bg-white px-6 py-14 text-center sm:px-12 sm:py-20">

          <span className="science-label">
            Your next discovery
          </span>

          <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">
            Генетика начинается
            <br />
            с любопытства.
          </h2>

          <p className="muted mx-auto mt-5 max-w-lg text-sm leading-7 sm:text-base">
            Начни с учебного примера или исследуй
            собственную последовательность ДНК.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">

            <Link
              href="/analyze"
              className="btn btn-primary"
            >
              Перейти к анализу ↗
            </Link>

            <Link
              href="/cases"
              className="btn btn-ghost"
            >
              Смотреть кейсы
            </Link>

          </div>

        </div>

      </section>

      {/* =====================
          FOOTER
      ===================== */}

      <footer className="w-full border-t border-[#2B2D42]/10 bg-white">

        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-center sm:px-8 md:flex-row lg:px-10">

          <Link
            href="/"
            className="font-bold tracking-tight"
          >
            GeneTutor{" "}
            <span className="text-[#EF233C]">
              AI
            </span>
          </Link>

          <p className="muted text-xs sm:text-sm">
            AI Sana · Генетика и искусственный интеллект
          </p>

          <p className="muted text-xs sm:text-sm">
            © GeneTutor AI
          </p>

        </div>

      </footer>

    </main>
  );
}
