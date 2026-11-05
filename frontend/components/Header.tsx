
"use client";

import Link from "next/link";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  useEffect,
  useState,
} from "react";

import {
  getToken,
  logout,
} from "@/lib/api";

function Logo() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#2b2d42] shadow-sm">

      <svg
        width="27"
        height="27"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >

        <path
          d="M10 4C10 10 22 10 22 16S10 22 10 28"
          stroke="#EF233C"
          strokeWidth="2.3"
          strokeLinecap="round"
        />

        <path
          d="M22 4C22 10 10 10 10 16S22 22 22 28"
          stroke="#D5B8E8"
          strokeWidth="2.3"
          strokeLinecap="round"
        />

        <path
          d="M12 9H20M12 16H20M12 23H20"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

      </svg>

    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();

  const [loggedIn, setLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
  }, [pathname]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function handleLogout() {
    logout();

    setLoggedIn(false);
    setMenuOpen(false);

    router.push("/");
    router.refresh();
  }

  const navLinks = loggedIn
    ? [
        { href: "/cases", label: "Кейсы" },
        { href: "/analyze", label: "Анализ" },
        { href: "/agent", label: "ИИ-репетитор" },
        { href: "/profile", label: "Профиль" },
      ]
    : [
        { href: "/cases", label: "Кейсы" },
      ];

  return (
    <header className="sticky top-0 z-50 border-b border-[#2b2d42]/5 bg-[#fff9f7]/90 backdrop-blur-xl">

      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-4 px-6">

        {/* LOGO */}

        <Link
          href="/"
          className="flex shrink-0 items-center gap-3"
        >

          <Logo />

          <span className="text-lg font-extrabold tracking-[-0.05em] text-[#2b2d42]">

            GeneTutor

            <span className="ml-1 gradient-text">
              AI
            </span>

          </span>

        </Link>

        {/* DESKTOP NAVIGATION */}

        <nav className="hidden items-center gap-7 md:flex">

          {navLinks.map((link) => {

            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-[#ef233c] ${
                  active
                    ? "text-[#ef233c]"
                    : "text-[#777587]"
                }`}
              >
                {link.label}
              </Link>
            );

          })}

        </nav>

        {/* DESKTOP AUTH */}

        <div className="hidden shrink-0 items-center gap-3 md:flex">

          {loggedIn ? (

            <button
              type="button"
              onClick={handleLogout}
              className="btn btn-ghost btn-sm"
            >
              Выйти
            </button>

          ) : (

            <>

              <Link
                href="/login"
                className="text-sm font-semibold text-[#2b2d42] transition hover:text-[#ef233c]"
              >
                Войти
              </Link>

              <Link
                href="/register"
                className="btn btn-primary btn-sm"
              >
                Регистрация
                <span aria-hidden="true">↗</span>
              </Link>

            </>

          )}

        </div>

        {/* MOBILE BUTTON */}

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#2b2d42]/10 bg-white text-[#2b2d42] md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
        >

          {menuOpen ? (

            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6L6 18M6 6L18 18" />
            </svg>

          ) : (

            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 7H20M4 12H20M4 17H20" />
            </svg>

          )}

        </button>

      </div>

      {/* MOBILE NAVIGATION */}

      {menuOpen && (

        <div
          id="mobile-navigation"
          className="border-t border-[#2b2d42]/5 bg-[#fff9f7] px-6 pb-6 pt-4 shadow-lg md:hidden"
        >

          <nav className="flex flex-col gap-1">

            {navLinks.map((link) => (

              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  pathname === link.href
                    ? "bg-[#f5effa] text-[#ef233c]"
                    : "text-[#2b2d42] hover:bg-[#edf2f4]"
                }`}
              >
                {link.label}
              </Link>

            ))}

          </nav>

          <div className="mt-4 flex flex-col gap-3 border-t border-[#2b2d42]/10 pt-5">

            {loggedIn ? (

              <button
                type="button"
                onClick={handleLogout}
                className="btn btn-ghost w-full"
              >
                Выйти
              </button>

            ) : (

              <>

                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="btn btn-ghost w-full"
                >
                  Войти
                </Link>

                <Link
                  href="/register"
                  onClick={() => setMenuOpen(false)}
                  className="btn btn-primary w-full"
                >
                  Регистрация ↗
                </Link>

              </>

            )}

          </div>

        </div>

      )}

    </header>
  );
}
