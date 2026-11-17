// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import ptBR from "@medagenda/shared/i18n/pt-BR.json";
import { MfaStep } from "@/components/auth/mfa-step";
import { ApiError } from "@/lib/api/client";

const verifyMfa = vi.fn();
vi.mock("@/lib/api/endpoints", () => ({
  authApi: { verifyMfa: (...a: unknown[]) => verifyMfa(...a) },
}));

function setup(onSuccess = vi.fn()) {
  render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <MfaStep onSuccess={onSuccess} />
    </NextIntlClientProvider>,
  );
  return { onSuccess, user: userEvent.setup() };
}

describe("MfaStep", () => {
  it("rejects a malformed TOTP code without calling the API", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(ptBR.auth.mfa.code), "12");
    await user.click(screen.getByRole("button", { name: ptBR.auth.mfa.submit }));
    expect(await screen.findByText(ptBR.auth.validation.codeFormat)).toBeInTheDocument();
    expect(verifyMfa).not.toHaveBeenCalled();
  });

  it("submits a valid code and then calls onSuccess", async () => {
    verifyMfa.mockResolvedValueOnce({ ok: true });
    const { user, onSuccess } = setup();
    await user.type(screen.getByLabelText(ptBR.auth.mfa.code), "123456");
    await user.click(screen.getByRole("button", { name: ptBR.auth.mfa.submit }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(verifyMfa).toHaveBeenCalledWith({ code: "123456" });
  });

  it("switches to recovery code and shows the translated API error", async () => {
    verifyMfa.mockRejectedValueOnce(new ApiError("MFA_INVALID_CODE", 401));
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: ptBR.auth.mfa.useRecovery }));
    await user.type(screen.getByLabelText(ptBR.auth.mfa.recoveryCode), "abcd-efgh-ijkl");
    await user.click(screen.getByRole("button", { name: ptBR.auth.mfa.submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(ptBR.errors.MFA_INVALID_CODE);
    expect(verifyMfa).toHaveBeenCalledWith({ recoveryCode: "abcd-efgh-ijkl" });
  });
});
