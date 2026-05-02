import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cifra Igreja",
  description: "Organize cifras para ensaio, culto e impressão"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
