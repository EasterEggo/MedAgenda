import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";

/** Header shell. Pass route-group specific navigation as `actions`. */
export async function SiteHeader({ actions }: { actions?: ReactNode }) {
  const t = await getTranslations("common");
  return (
    <header className="border-b border-slate-300 bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-xl font-bold text-primary">
          {t("appName")}
        </Link>
        <nav aria-label={t("nav.main")} className="flex flex-wrap items-center gap-3">
          {actions}
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
