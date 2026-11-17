// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Slot } from "@/lib/api/endpoints";
import { SlotPicker } from "@/components/booking/slot-picker";
import { Providers } from "./support";

const { slots } = vi.hoisted(() => ({ slots: vi.fn() }));
vi.mock("@/lib/api/endpoints", () => ({
  catalogApi: { slots: (...args: unknown[]) => slots(...args) },
}));

function slot(id: string, startsAt: string, provider: string): Slot {
  return {
    id,
    providerId: provider,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
    serviceType: "CONSULTATION",
    specialtyId: "spec-1",
    examTypeId: null,
    status: "OPEN",
    provider: { id: provider, name: provider, kind: "DOCTOR" },
    clinic: { id: "c1", name: "Clinica Centro", city: "São Paulo", timezone: "America/Sao_Paulo" },
  };
}

describe("SlotPicker", () => {
  it("groups open times by day and reports the chosen slot", async () => {
    slots.mockResolvedValue({
      items: [
        slot("s1", "2026-11-17T12:00:00.000Z", "Dr. Ana"),
        slot("s2", "2026-11-17T12:00:00.000Z", "Dr. Bruno"),
        slot("s3", "2026-11-18T13:00:00.000Z", "Dr. Ana"),
      ],
      nextCursor: null,
    });
    const onSelect = vi.fn();
    render(
      <Providers>
        <SlotPicker
          filters={{ serviceType: "CONSULTATION" }}
          city={null}
          selectedSlotId={null}
          onSelect={onSelect}
        />
      </Providers>,
    );

    // Two days are shown, and 09:00 appears once even though two professionals are free.
    expect(await screen.findByRole("heading", { name: /Tuesday/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Wednesday/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /9:00\s?AM with Dr\. Ana/ })).toHaveLength(1);

    await userEvent.setup().click(screen.getByRole("button", { name: /9:00\s?AM with Dr\. Ana/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }));
  });

  it("only asks the API for one 7-day window at a time", async () => {
    slots.mockResolvedValue({ items: [], nextCursor: null });
    render(
      <Providers>
        <SlotPicker
          filters={{ serviceType: "EXAM", examTypeId: "e1" }}
          city={null}
          selectedSlotId={null}
          onSelect={vi.fn()}
        />
      </Providers>,
    );
    expect(await screen.findByText(/no open times/i)).toBeInTheDocument();
    const params = slots.mock.calls.at(-1)![0] as { from: string; to: string; examTypeId: string };
    expect(params.examTypeId).toBe("e1");
    const span = new Date(params.to).getTime() - new Date(params.from).getTime();
    expect(span).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("applies the city filter on the client", async () => {
    const other = {
      ...slot("s9", "2026-11-17T15:00:00.000Z", "Dr. Caio"),
      clinic: { id: "c2", name: "Outra", city: "Belo Horizonte", timezone: "America/Sao_Paulo" },
    };
    slots.mockResolvedValue({
      items: [slot("s1", "2026-11-17T12:00:00.000Z", "Dr. Ana"), other],
      nextCursor: null,
    });
    render(
      <Providers>
        <SlotPicker
          filters={{ serviceType: "CONSULTATION" }}
          city="Belo Horizonte"
          selectedSlotId={null}
          onSelect={vi.fn()}
        />
      </Providers>,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /12:00\s?PM with Dr\. Caio/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /Dr\. Ana/ })).toBeNull();
  });
});
