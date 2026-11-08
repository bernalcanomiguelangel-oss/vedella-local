import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vedella Local",
  description:
    "Mercat de vedella local i traçable de Catalunya. Reserva ara, paga a l'entrega.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ca">
      <body>{children}</body>
    </html>
  );
}
