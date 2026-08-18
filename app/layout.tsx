import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "탐라는 전기예보제 요금·편익 분석 시뮬레이터 (PRAS - TAMRA)",
  description: "제주 주택용 TOU 및 전기차 자가소비용 고객의 전기예보 할인 효과 분석",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
