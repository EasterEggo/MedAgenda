import { RegisterSchema, type Locale, type RegisterInput } from "@medagenda/shared";
import { validateForm, type FieldErrors } from "./validation";

export const REGISTER_STEPS = ["account", "personal", "consent"] as const;
export type RegisterStep = (typeof REGISTER_STEPS)[number];

export interface RegisterValues {
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  cpf: string;
  birthDate: string;
  phone: string;
  consent: boolean;
}

export const EMPTY_REGISTER_VALUES: RegisterValues = {
  email: "",
  password: "",
  confirmPassword: "",
  fullName: "",
  cpf: "",
  birthDate: "",
  phone: "",
  consent: false,
};

const accountSchema = RegisterSchema.pick({ email: true, password: true });
const personalSchema = RegisterSchema.pick({
  fullName: true,
  cpf: true,
  birthDate: true,
  phone: true,
});
const consentSchema = RegisterSchema.pick({ consentLgpd: true });

/** Validates one wizard step with the shared schema. Returns field -> i18n key. */
export function validateRegisterStep(step: RegisterStep, values: RegisterValues): FieldErrors {
  switch (step) {
    case "account": {
      const { errors } = validateForm(accountSchema, {
        email: values.email,
        password: values.password,
      });
      if (!errors.password && values.password !== values.confirmPassword) {
        errors.confirmPassword = "auth.validation.passwordMismatch";
      }
      return errors;
    }
    case "personal":
      return validateForm(personalSchema, {
        fullName: values.fullName,
        cpf: values.cpf.trim() === "" ? undefined : values.cpf,
        birthDate: values.birthDate,
        phone: values.phone,
      }).errors;
    case "consent":
      return validateForm(consentSchema, { consentLgpd: values.consent }).errors;
  }
}

/** Builds the API payload. Call only after all steps validated. */
export function buildRegisterInput(values: RegisterValues, locale: Locale): RegisterInput {
  return RegisterSchema.parse({
    email: values.email,
    password: values.password,
    fullName: values.fullName,
    cpf: values.cpf.trim() === "" ? undefined : values.cpf,
    birthDate: values.birthDate,
    phone: values.phone,
    locale,
    consentLgpd: values.consent,
  });
}
