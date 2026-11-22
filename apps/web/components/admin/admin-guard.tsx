"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { useMe } from "@/components/auth/use-me";

/** Client-side guard: admins only. The API enforces the same rule. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.forbidden");
  const { data: me } = useMe();
  if (!me) return null;
  if (me.role === "ADMIN") return <>{children}</>;
  return (
    <div data-testid="admin-forbidden" className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Alert variant="error">{t("adminOnly")}</Alert>
      <Link href="/app" className="text-primary underline underline-offset-4">
        {t("goDashboard")}
      </Link>
    </div>
  );
}
