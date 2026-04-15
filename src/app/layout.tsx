import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "경력산정 자동화",
  description: "건설회사 채용 경력산정 자동화 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSansKR.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-noto-sans-kr)]">
        <header className="border-b bg-background">
          <div className="max-w-[1600px] mx-auto px-6 h-12 flex items-center gap-6">
            <Link href="/" className="font-semibold text-sm">
              경력산정 자동화
            </Link>
            <nav className="flex gap-4 text-sm text-muted-foreground">
              <Link href="/?reset=true" className="hover:text-foreground">새 분석</Link>
              <Link href="/history" className="hover:text-foreground">지원자 목록</Link>
              <Link href="/feedback" className="hover:text-foreground">개선 요청</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
