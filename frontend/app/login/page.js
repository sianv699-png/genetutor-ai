"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL, saveToken } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Ошибка входа");
        return;
      }
      saveToken(data.token);
      router.push("/analyze");
    } catch {
      setError("Не удалось связаться с сервером. Запущен ли бэкенд?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex w-full justify-center px-5 py-14 sm:py-20">
      <form onSubmit={handleSubmit} className="card flex w-full max-w-md min-w-0 flex-col gap-5 p-6 sm:p-8">
        <div>
          <span className="science-label">Вход</span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">С возвращением</h1>
          <p className="muted mt-2 text-sm leading-6">
            Войдите, чтобы анализировать последовательности и решать задания.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="label" htmlFor="password">
            Пароль
          </label>
          <input
            id="password"
            className="input"
            type="password"
            placeholder="Ваш пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="alert-error">{error}</p>}

        <button disabled={loading} className="btn btn-primary">
          {loading ? <span className="spinner" /> : "Войти"}
        </button>

        <p className="muted text-center text-sm">
          Нет аккаунта?{" "}
          <Link href="/register" className="link">
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </main>
  );
}
