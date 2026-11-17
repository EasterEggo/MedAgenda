import { Calendar, CalendarCheck, ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common.landing");

  const features = [
    { icon: CalendarCheck, title: t("bookTitle"), text: t("bookText") },
    { icon: Calendar, title: t("calendarTitle"), text: t("calendarText") },
    { icon: ShieldCheck, title: t("secureTitle"), text: t("secureText") },
  ];

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4 py-8">
        <h1 className="max-w-2xl text-3xl font-bold sm:text-5xl">{t("heroTitle")}</h1>
        <p className="max-w-2xl text-lg text-muted">{t("heroSubtitle")}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/register" className={buttonVariants()}>
            {t("ctaRegister")}
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "outline" })}>
            {t("ctaLogin")}
          </Link>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="flex flex-col gap-2">
            <Icon aria-hidden="true" className="size-8 text-primary" />
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-muted">{text}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
