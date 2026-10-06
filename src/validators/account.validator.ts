import { BadRequestError, ForbiddenError } from "#/core/error.response.js";
import type { AccountRole } from "#/auth/roles.js";
import type { AccountStatus } from "#/models/account.model.js";

export interface SellerProfileInput {
  storeName: string;
  description?: string;
}

export interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string;
  phone?: string;
  sellerProfile?: SellerProfileInput;
}

export interface UpdateRoleInput {
  role: AccountRole;
  sellerProfile?: SellerProfileInput;
}

export interface UpdateStatusInput {
  status: AccountStatus;
}

const PROFILE_TEXT_FIELDS = ["name", "avatarUrl", "phone"] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Required when promoting an account to seller without an existing seller profile. */
export const parseNewSellerProfile = (input?: SellerProfileInput) => {
  if (!input || typeof input !== "object") {
    throw new BadRequestError("sellerProfile is required when promoting an account to seller");
  }
  if (typeof input.storeName !== "string" || !input.storeName.trim()) {
    throw new BadRequestError("sellerProfile.storeName is required");
  }
  return {
    storeName: input.storeName.trim(),
    description: typeof input.description === "string" ? input.description.trim() : "",
  };
};

/** Builds a `$set` document for the user's own profile. Seller fields require `canEditSellerProfile`. */
export const parseProfileUpdate = (input: UpdateProfileInput, canEditSellerProfile: boolean) => {
  if (!isPlainObject(input)) throw new BadRequestError("Profile payload must be an object");

  const update: Record<string, string> = {};
  for (const field of PROFILE_TEXT_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== "string") throw new BadRequestError(`${field} must be a string`);
    if (field === "name" && !value.trim()) throw new BadRequestError("name cannot be empty");
    update[field] = value.trim();
  }

  if (input.sellerProfile !== undefined) {
    if (!canEditSellerProfile) {
      throw new ForbiddenError("Only seller accounts can update seller profile fields");
    }
    if (!isPlainObject(input.sellerProfile)) throw new BadRequestError("sellerProfile must be an object");

    const { storeName, description } = input.sellerProfile;
    if (storeName !== undefined) {
      if (typeof storeName !== "string" || !storeName.trim()) {
        throw new BadRequestError("sellerProfile.storeName cannot be empty");
      }
      update["sellerProfile.storeName"] = storeName.trim();
    }
    if (description !== undefined) {
      if (typeof description !== "string") throw new BadRequestError("sellerProfile.description must be a string");
      update["sellerProfile.description"] = description.trim();
    }
  }

  if (!Object.keys(update).length) throw new BadRequestError("No supported profile fields to update");
  return update;
};
