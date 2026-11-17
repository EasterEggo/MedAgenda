"use client";

import { useTranslations } from "next-intl";
import { CircleCheck, Ban, CircleDashed, CircleX, FlaskConical, Stethoscope } from "lucide-react";
import type { ServiceType } from "@medagenda/shared";
import type { AppointmentStatus } from "@medagenda/shared";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<AppointmentStatus, { className: string; icon: typeof CircleCheck }> = {
  SCHEDULED: { className: "border-success bg-success-bg text-success", icon: CircleCheck },
  CANCELLED: { className: "border-danger bg-danger-bg text-danger", icon: Ban },
  COMPLETED: { className: "border-slate-400 bg-slate-100 text-foreground", icon: CircleDashed },
  NO_SHOW: { className: "border-slate-400 bg-card text-muted", icon: CircleX },
};

/** Status is always shown as text and icon, never by colour alone. */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const t = useTranslations();
  const { className, icon: Icon } = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {t(`calendar.appointments.status.${status}`)}
    </span>
  );
}

/** Consultation vs exam, with an icon and a text label so the type never depends on colour. */
export function ServiceTypeBadge({ serviceType }: { serviceType: ServiceType }) {
  const t = useTranslations();
  const isExam = serviceType === "EXAM";
  const Icon = isExam ? FlaskConical : Stethoscope;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        isExam ? "bg-exam-bg text-exam" : "bg-primary-bg text-primary",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {t(`common.serviceType.${serviceType}`)}
    </span>
  );
}
