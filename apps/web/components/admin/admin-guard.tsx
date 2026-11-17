"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { useMe } from "@/components/auth/use-me";

/** Client-side guard: admins with 2FA enabled only. The API enforces the same rules. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.forbidden");
  const { data: me } = useMe();
  if (!me) return null;
  if (me.role === "ADMIN" && me.totpEnabled) return <>{children}</>;
  const needsMfa = me.role === "ADMIN";
  return (
    <div data-testid="admin-forbidden" className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Alert variant="error">{needsMfa ? t("mfaRequired") : t("adminOnly")}</Alert>
      <Link
        href={needsMfa ? "/app/settings" : "/app"}
        className="text-primary underline underline-offset-4"
      >
        {needsMfa ? t("goSettings") : t("goDashboard")}
      </Link>
    </div>
  );
}
