
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import Header from "@/components/Header";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GeneTutor AI — Изучайте генетику с ИИ",

  description:
    "Интерактивная платформа для изучения генетики. Анализируйте ДНК, находите мутации и изучайте генетику с персональным ИИ-репетитором.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${mono.variable}`}
    >
      <body className="min-h-screen">
        <Header />

        {children}
      </body>
    </html>
  );
}
