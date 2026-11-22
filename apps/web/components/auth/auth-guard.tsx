"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api/client";
import { useRouter } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { errorMessageKey } from "@/lib/api/client";
import { useMe } from "./use-me";

/** Renders children only for a fully authenticated session; otherwise redirects to /login. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const { data, error, isPending } = useMe();

  const redirectTo =
    error instanceof ApiError && (error.code === "UNAUTHENTICATED" || error.status === 401)
      ? "/login"
      : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (data) return <>{children}</>;
  if (error && !redirectTo) {
    const code = error instanceof ApiError ? error.code : "UNKNOWN";
    return <Alert variant="error">{t(errorMessageKey(code))}</Alert>;
  }
  return (
    <p role="status" className="text-muted">
      {isPending || redirectTo ? t("common.loading") : null}
    </p>
  );
}
