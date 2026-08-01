import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "管制システム",
  description: "警備会社向け管制システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
