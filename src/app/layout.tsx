import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Magon Payments",
  description: "Suscripciones Magon con Next.js + Supabase + GalioPay",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
