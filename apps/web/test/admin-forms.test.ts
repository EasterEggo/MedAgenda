import { describe, expect, it } from "vitest";
import { ENTITIES, emptyValues, toPayload } from "@/lib/admin/entities";
import { EMPTY_SLOT_FORM, validateSlotForm } from "@/lib/admin/slot-form";
import { validateForm } from "@/lib/validation";

describe("admin entity payloads", () => {
  it("parses numbers and nulls empty optional text", () => {
    const exam = emptyValues(ENTITIES.exams);
    expect(toPayload(ENTITIES.exams, { ...exam, durationMin: "30" }).durationMin).toBe(30);
    const provider = emptyValues(ENTITIES.providers);
    expect(toPayload(ENTITIES.providers, provider).crm).toBeNull();
  });

  it("validates with the shared schemas and returns i18n keys", () => {
    const { data, errors } = validateForm(
      ENTITIES.specialties.schema,
      toPayload(ENTITIES.specialties, emptyValues(ENTITIES.specialties)),
    );
    expect(data).toBeUndefined();
    expect(errors.slug).toBe("auth.validation.required");
    const ok = validateForm(ENTITIES.specialties.schema, {
      slug: "cardio",
      namePt: "C",
      nameEn: "C",
    });
    expect(ok.errors).toEqual({});
  });
});

describe("slot generator form", () => {
  const valid = {
    ...EMPTY_SLOT_FORM,
    providerId: "p1",
    specialtyId: "s1",
    from: "2030-01-01",
    to: "2030-01-10",
  };

  it("accepts a consultation with a specialty", () => {
    const { data, errors } = validateSlotForm(valid);
    expect(errors).toEqual({});
    expect(data).toMatchObject({ providerId: "p1", durationMin: 30, specialtyId: "s1" });
  });

  it("requires a specialty for consultations and rejects ranges over 92 days", () => {
    expect(validateSlotForm({ ...valid, specialtyId: "" }).data).toBeUndefined();
    const wide = validateSlotForm({ ...valid, to: "2031-01-01" });
    expect(wide.errors._form).toBe("errors.DATE_RANGE_TOO_LARGE");
  });
});
