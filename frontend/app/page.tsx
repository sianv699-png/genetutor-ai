import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-5xl font-bold">GeneTutor AI</h1>
      <p className="max-w-xl text-lg text-gray-600">
        Загрузите генетическую последовательность, и ИИ объяснит мутации
        и создаст задания для самопроверки.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <Link
          href="/analyze"
          className="rounded-lg bg-green-600 px-6 py-3 text-white hover:bg-green-700"
        >
          Начать анализ
        </Link>
        <Link
          href="/login"
          className="rounded-lg border px-6 py-3 hover:bg-gray-100 hover:text-black"
        >
          Войти
        </Link>
        <Link
          href="/register"
          className="rounded-lg border px-6 py-3 hover:bg-gray-100 hover:text-black"
        >
          Регистрация
        </Link>
      </div>
    </main>
  );
}