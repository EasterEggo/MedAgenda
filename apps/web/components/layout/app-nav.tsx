"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app", label: "common.nav.dashboard" },
  { href: "/app/book", label: "common.nav.book" },
  { href: "/app/calendar", label: "common.nav.calendar" },
  { href: "/app/appointments", label: "common.nav.appointments" },
] as const;

/** Links inside the signed-in area. The current page carries aria-current. */
export function AppNav() {
  const t = useTranslations();
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ITEMS.map((item) => {
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-foreground hover:bg-slate-100",
              active && "bg-primary-bg text-primary",
            )}
          >
            {t(item.label)}
          </Link>
        );
      })}
    </div>
  );
}
