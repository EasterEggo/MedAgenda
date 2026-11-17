"use client";

import { useTranslations } from "next-intl";
import { CircleCheck, FlaskConical, Stethoscope } from "lucide-react";
import type { ServiceType } from "@medagenda/shared";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ServiceType; icon: typeof Stethoscope; title: string; text: string }[] = [
  {
    value: "CONSULTATION",
    icon: Stethoscope,
    title: "booking.type.consultation",
    text: "booking.type.consultationText",
  },
  { value: "EXAM", icon: FlaskConical, title: "booking.type.exam", text: "booking.type.examText" },
];

/** Step 1: consultation or exam. Each option is a toggle button with aria-pressed. */
export function StepType({
  value,
  onChange,
}: {
  value: ServiceType | null;
  onChange: (value: ServiceType) => void;
}) {
  const t = useTranslations();
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-lg font-semibold">{t("booking.type.title")}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {OPTIONS.map(({ value: option, icon: Icon, title, text }) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={cn(
                "flex min-h-32 flex-col items-start gap-3 rounded-lg border-2 bg-card p-5 text-left transition-colors hover:border-primary",
                selected ? "border-primary ring-2 ring-primary" : "border-slate-300",
              )}
            >
              <span className="flex w-full items-center justify-between">
                <Icon aria-hidden="true" className="size-8 text-primary" />
                {selected ? (
                  <CircleCheck aria-hidden="true" className="size-6 text-primary" />
                ) : null}
              </span>
              <span className="text-lg font-semibold">{t(title)}</span>
              <span className="text-sm text-muted">{t(text)}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
