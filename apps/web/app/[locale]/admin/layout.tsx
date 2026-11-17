import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { UserMenu } from "@/components/layout/user-menu";
import { AppNav } from "@/components/layout/app-nav";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({
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
      <SiteHeader
        actions={
          <>
            <AppNav />
            <UserMenu />
          </>
        }
      />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <AuthGuard>
          <AdminGuard>
            <AdminNav />
            {children}
          </AdminGuard>
        </AuthGuard>
      </main>
    </>
  );
}
