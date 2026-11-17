import type { ReactNode } from "react";
import type { Metadata } from "next";
import ptBR from "@medagenda/shared/i18n/pt-BR.json";
import "./globals.css";

// Phase 1 renders the default locale only. Locale routing and next-intl arrive in Phase 7.
export const metadata: Metadata = {
  title: ptBR.common.appName,
  description: ptBR.common.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
