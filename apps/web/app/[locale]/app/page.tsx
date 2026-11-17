import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common.dashboard");
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p>{t("welcome")}</p>
      <p className="text-muted">{t("placeholder")}</p>
    </div>
  );
}
