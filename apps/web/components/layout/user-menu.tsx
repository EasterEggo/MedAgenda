"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/endpoints";

export function UserMenu() {
  const t = useTranslations("common.nav");
  const router = useRouter();
  const queryClient = useQueryClient();

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // Session may already be gone; either way we leave the app.
    }
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <Button variant="outline" onClick={logout}>
      {t("logout")}
    </Button>
  );
}
