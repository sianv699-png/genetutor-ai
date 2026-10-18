"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL, saveToken } from "@/lib/api";

export default function Register() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Ошибка регистрации");
        return;
      }
      saveToken(data.token);
      router.push("/analyze");
    } catch (err) {
      setError("Не удалось связаться с сервером. Запущен ли бэкенд?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-6 py-12">
      <div className="bg-aurora pointer-events-none absolute inset-0" />

      <form onSubmit={handleSubmit} className="card relative flex w-full max-w-md flex-col gap-5 p-8 shadow-2xl shadow-emerald-500/5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Создать аккаунт</h1>
          <p className="muted mt-1 text-sm">Это займёт меньше минуты.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="label">Имя</label>
          <input
            className="input"
            placeholder="Как к вам обращаться"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="label">Пароль</label>
          <input
            className="input"
            type="password"
            placeholder="Не короче 6 символов"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button disabled={loading} className="btn btn-primary">
          {loading ? <span className="spinner" /> : "Создать аккаунт"}
        </button>

        <p className="muted text-center text-sm">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-emerald-400 hover:underline">
            Войти
          </Link>
        </p>
      </form>
    </main>
  );
}