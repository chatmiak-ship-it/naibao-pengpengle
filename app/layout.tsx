import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "奶宝碰碰乐 · 合成小游戏",
  description: "从一瓶奶开始，把相同的奶宝碰在一起。手机与电脑都能玩的合成小游戏。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
