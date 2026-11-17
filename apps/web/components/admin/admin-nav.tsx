"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { ADMIN_SECTIONS } from "@/lib/admin/sections";

export function AdminNav() {
  const t = useTranslations("admin");
  const pathname = usePathname();
  return (
    <nav aria-label={t("navLabel")} className="mb-6 flex flex-wrap gap-2">
      {ADMIN_SECTIONS.map((s) => {
        const active = pathname === `/admin/${s}`;
        return (
          <Link
            key={s}
            href={`/admin/${s}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-semibold hover:bg-slate-100",
              active && "bg-primary-bg text-primary",
            )}
          >
            {t(`sections.${s}`)}
          </Link>
        );
      })}
    </nav>
  );
}
