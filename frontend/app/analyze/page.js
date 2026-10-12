"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, getToken, logout } from "@/lib/api";

const EXAMPLE_REF = "ATGGTGCACCTGACTCCTGAGGAGAAG";
const EXAMPLE_SAMPLE = "ATGGTGCACCTGACTCCTGTGGAGAAG";

const COLORS = {
  A: "text-green-500",
  T: "text-red-500",
  G: "text-yellow-500",
  C: "text-blue-500",
};

export default function Analyze() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [sequence, setSequence] = useState("");
  const [reference, setReference] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  async function handleAnalyze() {
    setError("");
    setResult(null);
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

  if (!user) return <p className="p-8">Загрузка...</p>;

  const mutatedPositions = new Set(
    (result?.mutations || []).map((m) => m.position)
  );

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Привет, {user.name}!</h1>
        <button
          onClick={() => {
            logout();
            router.push("/");
          }}
          className="rounded border px-4 py-2 hover:bg-gray-100 hover:text-black"
        >
          Выйти
        </button>
      </div>

      <section className="mt-8 flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Анализ последовательности</h2>

        <label className="text-sm text-gray-500">
          Исследуемая последовательность ДНК (A, T, G, C; можно вставить FASTA)
        </label>
        <textarea
          className="h-32 rounded border p-3 font-mono text-black"
          placeholder="ATGGTGCACCTGACT..."
          value={sequence}
          onChange={(e) => setSequence(e.target.value)}
        />

        <label className="text-sm text-gray-500">
          Эталонная последовательность (необязательно, для поиска мутаций)
        </label>
        <textarea
          className="h-24 rounded border p-3 font-mono text-black"
          placeholder="Нормальная последовательность той же длины"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />

        {error && <p className="text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleAnalyze}
            disabled={loading || !sequence.trim()}
            className="rounded bg-green-600 px-6 py-3 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "Анализ..." : "Анализировать"}
          </button>
          <button
            onClick={fillExample}
            className="rounded border px-6 py-3 hover:bg-gray-100 hover:text-black"
          >
            Вставить пример
          </button>
        </div>
      </section>

      {result && (
        <section className="mt-10 flex flex-col gap-6">
          <h2 className="text-xl font-semibold">Результат</h2>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Длина" value={`${result.stats.length} нт`} />
            <Stat label="GC-состав" value={`${result.stats.gc_percent}%`} />
            <Stat
              label="A / T"
              value={`${result.stats.counts.A} / ${result.stats.counts.T}`}
            />
            <Stat
              label="G / C"
              value={`${result.stats.counts.G} / ${result.stats.counts.C}`}
            />
          </div>

          <div>
            <h3 className="mb-2 font-semibold">Последовательность</h3>
            <p className="break-all rounded border p-3 font-mono leading-7">
              {result.sequence.split("").map((nt, i) => (
                <span
                  key={i}
                  className={
                    mutatedPositions.has(i + 1)
                      ? "rounded bg-red-600 px-0.5 text-white"
                      : COLORS[nt] || ""
                  }
                  title={`Позиция ${i + 1}`}
                >
                  {nt}
                </span>
              ))}
            </p>
            {result.mutations && (
              <p className="mt-1 text-sm text-gray-500">
                Красным выделены позиции, отличающиеся от эталона.
              </p>
            )}
          </div>

          <div>
            <h3 className="mb-2 font-semibold">РНК (транскрипция)</h3>
            <p className="break-all rounded border p-3 font-mono">
              {result.stats.rna}
            </p>
          </div>

          <div>
            <h3 className="mb-2 font-semibold">Белок (трансляция)</h3>
            <p className="break-all rounded border p-3 font-mono">
              {result.stats.protein}
            </p>
          </div>

          {result.mutations && (
            <div>
              <h3 className="mb-2 font-semibold">
                Найденные мутации: {result.mutations.length}
              </h3>
              {result.mutations.length === 0 ? (
                <p className="text-gray-500">Отличий от эталона нет.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2">Позиция</th>
                        <th className="p-2">Замена</th>
                        <th className="p-2">Кодон</th>
                        <th className="p-2">Аминокислота</th>
                        <th className="p-2">Эффект</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.mutations.map((m) => (
                        <tr key={m.position} className="border-b">
                          <td className="p-2">{m.position}</td>
                          <td className="p-2">
                            {m.ref} → {m.alt}
                          </td>
                          <td className="p-2">
                            {m.ref_codon ? `${m.ref_codon} → ${m.alt_codon}` : "—"}
                          </td>
                          <td className="p-2">
                            {m.ref_aa ? `${m.ref_aa} → ${m.alt_aa}` : "—"}
                          </td>
                          <td className="p-2">{m.effect || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded border p-4 text-center">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}