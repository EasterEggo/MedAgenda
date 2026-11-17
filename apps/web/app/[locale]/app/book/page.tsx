import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookingWizard } from "@/components/booking/booking-wizard";

export default async function BookPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common");
  return (
    <Suspense fallback={<p role="status">{t("loading")}</p>}>
      <BookingWizard />
    </Suspense>
  );
}
