"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { appointmentsApi, type Appointment } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { type BookingInput } from "@/lib/booking/input";
import {
  BOOKING_STEPS,
  canContinue,
  chooseCatalog,
  chooseCity,
  chooseClinic,
  chooseProvider,
  chooseServiceType,
  chooseSlot,
  initialBooking,
  nextStep,
  prevStep,
  slotFilters,
  stepIndex,
  type BookingState,
  type BookingStep,
} from "@/lib/booking/state";
import { StepCatalog } from "./step-catalog";
import { StepConfirm } from "./step-confirm";
import { StepLocation } from "./step-location";
import { StepProvider } from "./step-provider";
import { SlotPicker } from "./slot-picker";
import { StepSuccess } from "./step-success";
import { StepType } from "./step-type";

/** Seven-step booking flow (section 7). Each step is a component; the transitions live in lib/booking/state. */
export function BookingWizard() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [initial] = useState(() => initialBooking(searchParams.get("type")));
  const [state, setState] = useState<BookingState>(initial.state);
  const [step, setStep] = useState<BookingStep>(initial.step);
  const [notice, setNotice] = useState<string | null>(null);
  const [booked, setBooked] = useState<Appointment | null>(null);

  const book = useMutation({
    mutationFn: (input: BookingInput) => appointmentsApi.book(input),
    onSuccess: (appointment) => {
      setBooked(appointment);
      setNotice(null);
      setStep("done");
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["slots"] });
    },
    onError: (error) => {
      const code = toApiError(error).code;
      if (code === "SLOT_ALREADY_BOOKED") {
        // The time went to someone else: drop it and send the user back to pick another.
        setState((s) => ({ ...s, slot: null }));
        setStep("slot");
        void queryClient.invalidateQueries({ queryKey: ["slots"] });
      }
      setNotice(errorMessageKey(code));
    },
  });

  function goTo(next: BookingStep) {
    setNotice(null);
    setStep(next);
  }

  function restart() {
    setState(initialBooking(null).state);
    setBooked(null);
    setNotice(null);
    setStep("type");
  }

  const index = stepIndex(step);
  const serviceType = state.serviceType;
  const catalogId = state.catalogId;

  let content: ReactNode = null;
  switch (step) {
    case "type":
      content = (
        <StepType
          value={serviceType}
          onChange={(value) => setState((s) => chooseServiceType(s, value))}
        />
      );
      break;
    case "catalog":
      content = serviceType ? (
        <StepCatalog
          serviceType={serviceType}
          selectedId={catalogId}
          onSelect={(id) => setState((s) => chooseCatalog(s, id))}
        />
      ) : null;
      break;
    case "location":
      content = (
        <StepLocation
          city={state.city}
          clinicId={state.clinicId}
          onCity={(city) => setState((s) => chooseCity(s, city))}
          onClinic={(clinicId) => setState((s) => chooseClinic(s, clinicId))}
        />
      );
      break;
    case "provider":
      content =
        serviceType && catalogId ? (
          <StepProvider
            serviceType={serviceType}
            catalogId={catalogId}
            city={state.city}
            clinicId={state.clinicId}
            selectedId={state.providerId}
            onSelect={(id) => setState((s) => chooseProvider(s, id))}
          />
        ) : null;
      break;
    case "slot":
      content = (
        <SlotPicker
          filters={slotFilters(state)}
          city={state.city}
          selectedSlotId={state.slot?.id ?? null}
          onSelect={(slot) => setState((s) => chooseSlot(s, slot))}
        />
      );
      break;
    case "confirm":
      content = (
        <StepConfirm
          state={state}
          pending={book.isPending}
          onSubmit={(input) => book.mutate(input)}
          onChangeTime={() => goTo("slot")}
        />
      );
      break;
    case "done":
      content = booked ? <StepSuccess appointment={booked} onBookAnother={restart} /> : null;
      break;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">{t("booking.title")}</h1>
        <p className="text-muted" aria-live="polite">
          {t("booking.progress", {
            current: index + 1,
            total: BOOKING_STEPS.length,
            name: t(`booking.steps.${step}`),
          })}
        </p>
        <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{ width: `${((index + 1) / BOOKING_STEPS.length) * 100}%` }}
          />
        </div>
      </header>

      {notice ? <Alert variant="error">{t(notice)}</Alert> : null}

      <div>{content}</div>

      {step !== "done" ? (
        <div className="flex flex-wrap justify-between gap-3 border-t border-slate-300 pt-6">
          {step !== "type" ? (
            <Button variant="outline" onClick={() => goTo(prevStep(step))}>
              {t("common.actions.back")}
            </Button>
          ) : (
            <span />
          )}
          {step !== "confirm" ? (
            <Button disabled={!canContinue(step, state)} onClick={() => goTo(nextStep(step))}>
              {t("common.actions.next")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
