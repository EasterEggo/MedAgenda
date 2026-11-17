import { GenerateSlotsSchema } from "@medagenda/shared";
import type { GenerateSlotsInput } from "@/lib/api/endpoints";
import { validateForm, type FieldErrors } from "@/lib/validation";

export interface SlotFormValues {
  providerId: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  durationMin: string;
  from: string;
  to: string;
  serviceType: "CONSULTATION" | "EXAM";
  specialtyId: string;
  examTypeId: string;
}

export const EMPTY_SLOT_FORM: SlotFormValues = {
  providerId: "",
  weekdays: [1, 2, 3, 4, 5],
  startTime: "08:00",
  endTime: "12:00",
  durationMin: "30",
  from: "",
  to: "",
  serviceType: "CONSULTATION",
  specialtyId: "",
  examTypeId: "",
};

/** Validates the generator form with the shared schema. */
export function validateSlotForm(values: SlotFormValues): {
  data?: GenerateSlotsInput;
  errors: FieldErrors;
} {
  const result = validateForm(GenerateSlotsSchema, {
    providerId: values.providerId,
    weekdays: values.weekdays,
    startTime: values.startTime,
    endTime: values.endTime,
    durationMin: values.durationMin.trim() === "" ? "" : Number(values.durationMin),
    from: values.from,
    to: values.to,
    serviceType: values.serviceType,
    ...(values.serviceType === "CONSULTATION"
      ? { specialtyId: values.specialtyId || undefined }
      : { examTypeId: values.examTypeId || undefined }),
  });
  return { data: result.data as GenerateSlotsInput | undefined, errors: result.errors };
}
