// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import en from "@medagenda/shared/i18n/en.json";
import { ApiError } from "@/lib/api/client";
import type { Appointment } from "@/lib/api/endpoints";
import { AppointmentSheet } from "@/components/appointments/appointment-sheet";
import { Providers } from "./support";

const { get, cancel, downloadIcs } = vi.hoisted(() => ({
  get: vi.fn(),
  cancel: vi.fn(),
  downloadIcs: vi.fn(),
}));
vi.mock("@/lib/api/endpoints", () => ({
  appointmentsApi: {
    get: (...a: unknown[]) => get(...a),
    cancel: (...a: unknown[]) => cancel(...a),
    reschedule: vi.fn(),
    downloadIcs: (...a: unknown[]) => downloadIcs(...a),
  },
  calendarApi: { createFeed: vi.fn() },
}));

function appointment(startsAt: string): Appointment {
  return {
    id: "a1",
    status: "SCHEDULED",
    slotId: "s1",
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
    serviceType: "CONSULTATION",
    specialty: { id: "spec-1", namePt: "Cardiologia", nameEn: "Cardiology" },
    examType: null,
    provider: { id: "p1", name: "Dr. Ana", kind: "DOCTOR" },
    clinic: {
      id: "c1",
      name: "Clinica Centro",
      address: "Rua A, 10",
      city: "São Paulo",
      phone: "1100",
      timezone: "America/Sao_Paulo",
    },
    notes: null,
    sequence: 0,
    createdAt: "2026-11-01T00:00:00.000Z",
    cancelledAt: null,
  };
}

const later = () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

function open() {
  return render(
    <Providers>
      <AppointmentSheet appointmentId="a1" onClose={vi.fn()} onChanged={vi.fn()} />
    </Providers>,
  );
}

describe("AppointmentSheet", () => {
  beforeEach(() => {
    get.mockReset();
    cancel.mockReset();
    downloadIcs.mockReset();
  });

  it("shows the translated API error when cancellation is no longer allowed", async () => {
    get.mockResolvedValue(appointment(later()));
    cancel.mockRejectedValue(new ApiError("CANCELLATION_WINDOW_CLOSED", 409));
    open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: en.calendar.actions.cancel }));
    expect(
      screen.getByRole("heading", { name: en.calendar.actions.cancelTitle }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: en.calendar.actions.confirmCancel }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      en.errors.CANCELLATION_WINDOW_CLOSED,
    );
    expect(cancel).toHaveBeenCalledWith("a1");
  });

  it("hides cancel and reschedule inside the 2-hour window", async () => {
    get.mockResolvedValue(appointment(new Date(Date.now() + 60 * 60_000).toISOString()));
    open();
    expect(await screen.findByText(en.calendar.actions.windowNote)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.calendar.actions.cancel })).toBeNull();
    expect(screen.queryByRole("button", { name: en.calendar.actions.reschedule })).toBeNull();
  });

  it("downloads the .ics through the authenticated client", async () => {
    get.mockResolvedValue(appointment(later()));
    downloadIcs.mockResolvedValue({
      blob: new Blob(["BEGIN:VCALENDAR"]),
      filename: "consulta.ics",
    });
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: en.calendar.links.download }));
    expect(downloadIcs).toHaveBeenCalledWith("a1");
    expect(createObjectURL).toHaveBeenCalled();
  });
});
