// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import en from "@medagenda/shared/i18n/en.json";
import { MfaSection, secretFromUri } from "@/components/settings/mfa-section";
import type { MeResponse } from "@/lib/api/endpoints";

const setup = vi.fn();
const enable = vi.fn();
vi.mock("@/lib/api/endpoints", () => ({
  mfaApi: { setup: () => setup(), enable: (c: string) => enable(c), disable: vi.fn() },
}));

const me = { totpEnabled: false } as MeResponse;

function renderSection() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <QueryClientProvider client={new QueryClient()}>
        <MfaSection me={me} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return userEvent.setup();
}

describe("secretFromUri", () => {
  it("reads the secret parameter", () => {
    expect(secretFromUri("otpauth://totp/MedAgenda:a@b.c?secret=ABCD2345&issuer=MedAgenda")).toBe(
      "ABCD2345",
    );
    expect(secretFromUri("not a uri")).toBe("");
  });
});

describe("MfaSection", () => {
  it("shows recovery codes until the user confirms they saved them", async () => {
    setup.mockResolvedValue({
      otpauthUri: "otpauth://totp/x?secret=ABCD2345",
      qrDataUrl: "data:,",
    });
    enable.mockResolvedValue({ recoveryCodes: ["aaaa-bbbb", "cccc-dddd"] });
    const user = renderSection();

    await user.click(screen.getByRole("button", { name: en.settings.mfa.start }));
    expect(await screen.findByLabelText(en.settings.mfa.manualSecret)).toHaveValue("ABCD2345");
    await user.type(screen.getByLabelText(en.settings.mfa.code), "123456");
    await user.click(screen.getByRole("button", { name: en.settings.mfa.enable }));

    expect(enable).toHaveBeenCalledWith("123456");
    expect(await screen.findByText("aaaa-bbbb")).toBeInTheDocument();
    const done = screen.getByRole("button", { name: en.settings.mfa.recoveryDone });
    expect(done).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: en.settings.mfa.recoverySaved }));
    expect(done).toBeEnabled();
    await user.click(done);
    expect(screen.queryByText("aaaa-bbbb")).not.toBeInTheDocument();
  });
});
