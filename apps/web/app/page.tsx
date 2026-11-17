import ptBR from "@medagenda/shared/i18n/pt-BR.json";
import { apiBaseUrl } from "../lib/config";

export default function HomePage() {
  const t = ptBR.common;
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-semibold">{t.appName}</h1>
      <p className="text-lg text-slate-700">{t.tagline}</p>
      <a
        className="w-fit font-medium text-teal-700 underline underline-offset-4"
        href={`${apiBaseUrl}/health`}
      >
        {t.apiHealthLink}
      </a>
    </main>
  );
}
