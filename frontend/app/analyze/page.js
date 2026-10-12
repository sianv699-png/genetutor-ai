"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, getToken, logout } from "@/lib/api";

export default function Analyze() {
  const router = useRouter();
  const [user, setUser] = useState(null);

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

  if (!user) return <p className="p-8">Загрузка...</p>;

  return (
    <main className="p-8">
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
      <p className="mt-6 text-gray-500">
        Здесь будет загрузка последовательности и анализ.
      </p>
    </main>
  );
}