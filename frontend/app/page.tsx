import Link from "next/link";

const DEMO_SEQ = "ATGGTGCACCTGACTCCTGTGGAGAAG";
const MUT_INDEX = 19;

const FEATURES = [
  {
    title: "Анализ последовательности",
    text: "Длина, GC-состав, количество нуклеотидов, транскрипция в РНК и трансляция в белок.",
    icon: "🧬",
  },
  {
    title: "Поиск мутаций",
    text: "Сравнение с эталоном, подсветка отличий и определение типа: синонимичная, миссенс или нонсенс.",
    icon: "🔬",
  },
  {
    title: "ИИ-репетитор",
    text: "Объясняет результат простым языком и создаёт задания для самопроверки по вашему анализу.",
    icon: "✨",
  },
];

const STEPS = [
  { n: "1", title: "Загрузите последовательность", text: "Вставьте ДНК или FASTA и, при желании, эталон для сравнения." },
  { n: "2", title: "Получите анализ", text: "Мутации, кодоны и аминокислоты считаются алгоритмами, а не угадываются." },
  { n: "3", title: "Учитесь с ИИ", text: "Прочитайте объяснение и решите задания, чтобы закрепить тему." },
];

export default function Home() {
  return (
    <main>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="bg-aurora pointer-events-none absolute inset-0" />
        <div className="bg-grid pointer-events-none absolute inset-0" />

        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Генетика + искусственный интеллект
          </span>

          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Изучайте генетику{" "}
            <span className="bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-transparent">
              с ИИ-репетитором
            </span>
          </h1>

          <p className="muted mx-auto mt-6 max-w-2xl text-lg">
            Загрузите последовательность ДНК. GeneTutor найдёт мутации, объяснит их
            простым языком и создаст задания для самопроверки.
          </p>

          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/analyze" className="btn btn-primary">
              Начать анализ
            </Link>
            <Link href="/register" className="btn btn-ghost">
              Создать аккаунт
            </Link>
          </div>

          {/* превью результата */}
          <div className="card mx-auto mt-16 max-w-3xl overflow-hidden text-left shadow-2xl shadow-emerald-500/10">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-400/70" />
              <span className="h-3 w-3 rounded-full bg-amber-400/70" />
              <span className="h-3 w-3 rounded-full bg-emerald-400/70" />
              <span className="mono ml-3 text-xs muted">GeneTutor · пример анализа</span>
            </div>

            <div className="space-y-5 p-6">
              <div>
                <p className="label mb-2">Последовательность</p>
                <p className="mono break-all text-lg tracking-wider">
                  {DEMO_SEQ.split("").map((nt, i) => (
                    <span key={i} className={i === MUT_INDEX ? "nt-mut" : `nt-${nt}`}>
                      {nt}
                    </span>
                  ))}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Длина", "27 нт"],
                  ["GC-состав", "55.56%"],
                  ["Мутаций", "1"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                    <p className="text-xs muted">{label}</p>
                    <p className="text-lg font-bold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
                <p className="mb-1 font-semibold text-emerald-300">ИИ-репетитор</p>
                <p className="muted">
                  Миссенс-мутация в 7-м кодоне: GAG → GTG. Глутаминовая кислота (E)
                  заменена на валин (V), это может изменить свойства белка.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">Что умеет GeneTutor</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6 transition hover:border-emerald-500/30">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-xl">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="muted mt-2 text-sm leading-6">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* STEPS */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="text-center text-3xl font-bold tracking-tight">Как это работает</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-6">
              <span className="mono flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 font-bold text-emerald-300">
                {s.n}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="muted mt-2 text-sm leading-6">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-sm muted">
        GeneTutor AI · проект AI Sana · генетика и искусственный интеллект
      </footer>
    </main>
  );
}