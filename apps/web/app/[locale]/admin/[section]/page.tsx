import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ADMIN_SECTIONS, type AdminSection } from "@/lib/admin/sections";
import { AdminSectionView } from "@/components/admin/admin-section-view";

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ locale: string; section: string }>;
}) {
  const { locale, section } = await params;
  setRequestLocale(locale);
  if (!(ADMIN_SECTIONS as readonly string[]).includes(section)) notFound();
  return <AdminSectionView section={section as AdminSection} />;
}
