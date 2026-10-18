"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getToken, logout } from "@/lib/api";

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="9" fill="#10b981" fillOpacity="0.15" />
      <path d="M10 6c0 6 12 6 12 12s-12 6-12 12" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22 6c0 6-12 6-12 12s12 6 12 12" stroke="#6ee7b7" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12.5 12h7M12.5 24h7" stroke="#34d399" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
  }, [pathname]);

  function handleLogout() {
    logout();
    setLoggedIn(false);
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#070a0f]/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <Logo />
          <span>
            GeneTutor <span className="text-emerald-400">AI</span>
          </span>
        </Link>

               <nav className="flex items-center gap-2">
          <Link href="/cases" className="btn btn-ghost btn-sm">
            Кейсы
          </Link>
          {loggedIn ? (
            <>
              <Link href="/analyze" className="btn btn-ghost btn-sm">
                Анализ
              </Link>

              <Link href="/agent" className="btn btn-ghost btn-sm">
                Репетитор
              </Link>

              <button onClick={handleLogout} className="btn btn-ghost btn-sm">
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">
                Войти
              </Link>
              <Link href="/register" className="btn btn-primary btn-sm">
                Регистрация
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}