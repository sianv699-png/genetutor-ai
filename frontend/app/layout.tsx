import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
});

const mono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "GeneTutor AI — ИИ для изучения генетики",
  description:
    "Загрузите последовательность ДНК: ИИ найдёт мутации, объяснит результат и создаст задания для самопроверки.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}