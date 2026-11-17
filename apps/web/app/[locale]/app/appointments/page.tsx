import { setRequestLocale } from "next-intl/server";
import { AppointmentsList } from "@/components/appointments/appointments-list";

export default async function AppointmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AppointmentsList />;
}
