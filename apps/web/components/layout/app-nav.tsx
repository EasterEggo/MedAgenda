"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useMe } from "@/components/auth/use-me";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app", label: "common.nav.dashboard" },
  { href: "/app/book", label: "common.nav.book" },
  { href: "/app/calendar", label: "common.nav.calendar" },
  { href: "/app/appointments", label: "common.nav.appointments" },
  { href: "/app/settings", label: "common.nav.settings" },
] as const;
const ADMIN_ITEM = { href: "/admin", label: "common.nav.admin" } as const;

/** Links inside the signed-in area. The current page carries aria-current. */
export function AppNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const { data: me } = useMe();
  const items = me?.role === "ADMIN" ? [...ITEMS, ADMIN_ITEM] : ITEMS;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
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
