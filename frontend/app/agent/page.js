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
      } catch {
        router.push("/login");
      }
    }
    checkUser();
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    } catch {
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
    <main className="w-full min-w-0">
      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <span className="science-label">ИИ-агент</span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">GeneTutor-репетитор</h1>
        <p className="muted mt-4 leading-7">
          Задавайте вопросы по генетике. Агент сам вызывает инструменты анализа, чтобы расчёты были
          точными, и объясняет результат.
        </p>

        <section className="card mt-8 flex min-h-[26rem] min-w-0 flex-col p-4 sm:p-5">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {messages.length === 0 && (
              <div className="my-auto py-6">
                <p className="label mb-3 text-center">Попробуйте спросить</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-xl border border-[#2B2D42]/12 bg-white px-4 py-3 text-left text-sm leading-6 transition-colors hover:bg-[#f5e9e8]"
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
                className={`flex min-w-0 flex-col gap-1.5 ${
                  m.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 ${
                    m.role === "user" ? "bg-[#2B2D42] text-white" : "bg-[#f5e9e8] text-[#2B2D42]"
                  }`}
                >
                  {m.text}
                </div>
                {m.tools && m.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {[...new Set(m.tools)].map((t) => (
                      <span key={t} className="badge b-lav">
                        Инструмент: {TOOL_LABELS[t] || t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="muted flex items-center gap-2 text-sm">
                <span className="spinner" /> Агент думает...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && <p className="alert-error mt-4">{error}</p>}

          <div className="rule-t mt-4 flex gap-3 pt-4">
            <textarea
              className="input h-14 resize-none text-sm"
              placeholder="Напишите вопрос... (Enter для отправки)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Сообщение"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="btn btn-primary"
            >
              Отправить
            </button>
          </div>
        </section>

        <p className="muted mt-4 text-xs leading-5">
          Ответы сгенерированы ИИ и могут содержать неточности. Информация учебная и не является
          медицинской.
        </p>
      </div>
    </main>
  );
}
