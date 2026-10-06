import { BadRequestError } from "#/core/error.response.js";
import type { AccountRole } from "#/auth/roles.js";

export interface CredentialsInput {
  email?: string;
  password?: string;
}

export interface SignUpInput extends CredentialsInput {
  name?: string;
  storeName?: string;
  storeDescription?: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface SignUpPayload extends Credentials {
  name: string;
  sellerProfile?: {
    storeName: string;
    description: string;
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
/** bcrypt silently truncates input beyond 72 bytes. */
const MAX_PASSWORD_BYTES = 72;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 150;
const MAX_STORE_DESCRIPTION_LENGTH = 2_000;

const asObject = <T extends object>(value: T): Partial<T> => (value && typeof value === "object" ? value : {});

const requiredText = (value: unknown, requiredMessage: string, label: string, maxLength: number): string => {
  if (typeof value !== "string" || !value.trim()) throw new BadRequestError(requiredMessage);
  const text = value.trim();
  if (text.length > maxLength) throw new BadRequestError(`${label} must not exceed ${maxLength} characters`);
  return text;
};

const normalizeEmail = (value?: string): string => {
  if (typeof value !== "string") throw new BadRequestError("Email is required");
  const email = value.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) throw new BadRequestError("Email is invalid");
  return email;
};

const parsePassword = (value: string | undefined, { enforceStrength }: { enforceStrength: boolean }): string => {
  if (typeof value !== "string" || !value) throw new BadRequestError("Password is required");
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
    throw new BadRequestError(`Password must not exceed ${MAX_PASSWORD_BYTES} UTF-8 bytes`);
  }
  if (enforceStrength && value.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestError(`Password must contain at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return value;
};

const parseSellerProfile = ({ storeName, storeDescription }: SignUpInput) => {
  const name = requiredText(storeName, "Store name is required for seller accounts", "Store name", MAX_NAME_LENGTH);
  if (storeDescription !== undefined && typeof storeDescription !== "string") {
    throw new BadRequestError("Store description must be a string");
  }
  const description = storeDescription?.trim() ?? "";
  if (description.length > MAX_STORE_DESCRIPTION_LENGTH) {
    throw new BadRequestError(`Store description must not exceed ${MAX_STORE_DESCRIPTION_LENGTH} characters`);
  }
  return { storeName: name, description };
};

export const parseCredentials = (value: CredentialsInput): Credentials => {
  const input = asObject(value);
  return {
    email: normalizeEmail(input.email),
    password: parsePassword(input.password, { enforceStrength: false }),
  };
};

export const parseSignUpPayload = (
  value: SignUpInput,
  role: Exclude<AccountRole, "admin"> = "buyer",
): SignUpPayload => {
  const input = asObject(value);
  const payload: SignUpPayload = {
    name: requiredText(input.name, "Name is required", "Name", MAX_NAME_LENGTH),
    email: normalizeEmail(input.email),
    password: parsePassword(input.password, { enforceStrength: true }),
  };
  if (role === "seller") payload.sellerProfile = parseSellerProfile(input);
  return payload;
};
