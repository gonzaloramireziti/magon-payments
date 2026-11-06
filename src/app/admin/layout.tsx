import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/spotlight/styles.css";
import "./admin.css";
import type { ReactNode } from "react";
import { ColorSchemeScript } from "@mantine/core";
import { Inter } from "next/font/google";
import { Providers } from "./Providers";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata = { title: "Magon · Panel" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      {/* Mantine aplica la tipografía en <body>, fuera de este layout: la variable va en :root. */}
      <style>{`:root { --font-inter: ${inter.style.fontFamily}; }`}</style>
      <ColorSchemeScript defaultColorScheme="auto" />
      <Providers>{children}</Providers>
    </div>
  );
}
