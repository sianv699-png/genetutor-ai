"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, getToken, logout } from "@/lib/api";

const TOOL_LABELS = {
  analyze_dna: "Анализ ДНК",
  compare_sequences: "Сравнение последовательностей",
  codon_lookup: "Таблица кодонов",
  get_my_recent_analyses: "История анализов",
  predict_missense_impact: "ML-модель",
};

const SUGGESTIONS = [
  "Сравни ATGGTGCACCTGACTCCTGAGGAGAAG и ATGGTGCACCTGACTCCTGTGGAGAAG. Что это за мутация?",
  "Какую аминокислоту кодирует GAG, а какую GTG?",
  "Покажи мои последние анализы",
  "Объясни, чем миссенс-мутация отличается от нонсенс",
];

export default function Agent() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || loading) return;

    setError("");
    setInput("");
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json();
      if (res.status === 401) {
        logout();
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setError(data.detail || "Ошибка агента");
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "model", text: data.reply, tools: data.tools_used || [] },
      ]);
    } catch (err) {
      setError("Не удалось связаться с сервером. Запущен ли бэкенд?");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (!user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <span className="spinner" />
      </main>
    );
  }

  return (
    <main className="relative">
      <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 h-[28rem]" />

      <div className="relative mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6">
          <p className="text-sm text-emerald-400">ИИ-агент</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">GeneTutor-репетитор</h1>
          <p className="muted mt-2">
            Задавайте вопросы по генетике. Агент сам вызывает инструменты анализа, чтобы
            расчёты были точными, и объясняет результат.
          </p>
        </div>

        <div className="card flex min-h-[28rem] flex-col p-5">
          <div className="flex flex-1 flex-col gap-4">
            {messages.length === 0 && (
              <div className="my-auto text-center">
                <p className="muted mb-4 text-sm">Попробуйте спросить:</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="btn btn-ghost justify-start text-left text-sm"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
                    m.role === "user"
                      ? "bg-emerald-500 text-[#04130d]"
                      : "border border-white/10 bg-white/[0.05]"
                  }`}
                >
                  {m.text}
                </div>
                {m.tools && m.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {[...new Set(m.tools)].map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-300"
                      >
                        🔧 {TOOL_LABELS[t] || t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-sm muted">
                <span className="spinner" /> Агент думает...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <textarea
              className="input h-14 resize-none text-sm"
              placeholder="Напишите вопрос... (Enter для отправки)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="btn btn-primary"
            >
              Отправить
            </button>
          </div>
        </div>

        <p className="muted mt-4 text-xs">
          Ответы сгенерированы ИИ и могут содержать неточности. Информация учебная и не является
          медицинской.
        </p>
      </div>
    </main>
  );
}
