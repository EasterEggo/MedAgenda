// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import en from "@medagenda/shared/i18n/en.json";
import { StepType } from "@/components/booking/step-type";
import { StepCatalog } from "@/components/booking/step-catalog";
import { Providers } from "./support";

const { specialties } = vi.hoisted(() => ({ specialties: vi.fn() }));
vi.mock("@/lib/api/endpoints", () => ({
  catalogApi: { specialties: (...a: unknown[]) => specialties(...a) },
}));

describe("StepType", () => {
  it("marks the chosen service with aria-pressed and reports the change", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Providers>
        <StepType value={null} onChange={onChange} />
      </Providers>,
    );
    const user = userEvent.setup();
    const exam = screen.getByRole("button", { name: /Exam/ });
    expect(exam).toHaveAttribute("aria-pressed", "false");

    await user.click(exam);
    expect(onChange).toHaveBeenCalledWith("EXAM");

    rerender(
      <Providers>
        <StepType value="EXAM" onChange={onChange} />
      </Providers>,
    );
    expect(screen.getByRole("button", { name: /Exam/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Consultation/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("StepCatalog", () => {
  it("filters specialties by name, ignoring accents and case", async () => {
    specialties.mockResolvedValue({
      items: [
        { id: "1", slug: "cardiologia", namePt: "Cardiologia", nameEn: "Cardiology" },
        { id: "2", slug: "dermatologia", namePt: "Dermatologia", nameEn: "Dermatology" },
      ],
      nextCursor: null,
    });
    render(
      <Providers>
        <StepCatalog serviceType="CONSULTATION" selectedId={null} onSelect={vi.fn()} />
      </Providers>,
    );
    expect(await screen.findByRole("button", { name: "Cardiology" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dermatology" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox", { name: en.booking.catalog.search }), "CARDIO");
    expect(screen.getByRole("button", { name: "Cardiology" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dermatology" })).toBeNull();
  });
});
