import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { UserMenu } from "@/components/layout/user-menu";
import { AuthGuard } from "@/components/auth/auth-guard";

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader actions={<UserMenu />} />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <AuthGuard>{children}</AuthGuard>
      </main>
    </>
  );
}
