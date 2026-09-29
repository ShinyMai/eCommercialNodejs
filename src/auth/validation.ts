"use strict";

import { BadRequestError } from "#/core/error.response.js";
import type { AccountRole } from "#/auth/roles.js";

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

const normalizeEmail = (value: unknown): string => {
  if (typeof value !== "string") throw new BadRequestError("Email is required");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestError("Email is invalid");
  }
  return email;
};

const parsePassword = (value: unknown, enforceStrength: boolean): string => {
  if (typeof value !== "string" || !value) {
    throw new BadRequestError("Password is required");
  }
  const byteLength = Buffer.byteLength(value, "utf8");
  if (byteLength > 72) {
    throw new BadRequestError("Password must not exceed 72 UTF-8 bytes");
  }
  if (enforceStrength && value.length < 12) {
    throw new BadRequestError("Password must contain at least 12 characters");
  }
  return value;
};

export const parseCredentials = (value: unknown): Credentials => {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    email: normalizeEmail(input.email),
    password: parsePassword(input.password, false),
  };
};

export const parseSignUpPayload = (
  value: unknown,
  role: Exclude<AccountRole, "admin"> = "buyer",
): SignUpPayload => {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new BadRequestError("Name is required");
  }
  const name = input.name.trim();
  if (name.length > 150) throw new BadRequestError("Name must not exceed 150 characters");
  const result: SignUpPayload = {
    name,
    email: normalizeEmail(input.email),
    password: parsePassword(input.password, true),
  };
  if (role === "seller") {
    if (typeof input.storeName !== "string" || !input.storeName.trim()) {
      throw new BadRequestError("Store name is required for seller accounts");
    }
    const storeName = input.storeName.trim();
    if (storeName.length > 150) {
      throw new BadRequestError("Store name must not exceed 150 characters");
    }
    if (input.storeDescription !== undefined && typeof input.storeDescription !== "string") {
      throw new BadRequestError("Store description must be a string");
    }
    const description = typeof input.storeDescription === "string"
      ? input.storeDescription.trim()
      : "";
    if (description.length > 2_000) {
      throw new BadRequestError("Store description must not exceed 2000 characters");
    }
    result.sellerProfile = { storeName, description };
  }
  return result;
};
