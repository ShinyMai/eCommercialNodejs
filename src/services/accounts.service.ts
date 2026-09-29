"use strict";

import { hasMinimumRole, isAccountRole, type AccountRole } from "#/auth/roles.js";
import {
  BadRequestError,
  ConflictRequestError,
  ForbiddenError,
  NotFoundError,
} from "#/core/error.response.js";
import {
  AccountModel,
  isAccountStatus,
  type Account,
  type AccountStatus,
} from "#/models/account.model.js";
import { DiscountModel } from "#/models/discount.model.js";
import { ProductModel } from "#/models/products.model.js";
import { UserProfileModel } from "#/models/userProfile.model.js";
import { profilePopulation } from "#/models/repositories/account.repo.js";
import { type QueryFilter, Types } from "mongoose";

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

const accountFields = "email role status verified createdAt updatedAt";

export default class AccountsService {
  static async getAccount(accountId: string) {
    if (!Types.ObjectId.isValid(accountId)) throw new BadRequestError("Invalid account ID");
    const account = await AccountModel.findById(accountId)
      .select(accountFields)
      .populate(profilePopulation)
      .lean();
    if (!account) throw new NotFoundError("Account not found");
    return account;
  }

  static async list({
    role,
    status,
    page,
    limit,
  }: {
    role?: string;
    status?: string;
    page: number;
    limit: number;
  }) {
    const filter: QueryFilter<Account> = {};
    if (role) {
      if (!isAccountRole(role)) throw new BadRequestError("Invalid account role");
      filter.role = role;
    }
    if (status) {
      if (!isAccountStatus(status)) {
        throw new BadRequestError("Invalid account status");
      }
      filter.status = status;
    }
    const skip = (page - 1) * limit;
    const [accounts, total] = await Promise.all([
      AccountModel.find(filter)
        .select(accountFields)
        .populate(profilePopulation)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AccountModel.countDocuments(filter),
    ]);
    return { accounts, total };
  }

  static async updateRole(
    actorAccountId: string,
    accountId: string,
    role: AccountRole,
    sellerProfileInput?: SellerProfileInput,
  ) {
    if (!Types.ObjectId.isValid(accountId) || !isAccountRole(role)) {
      throw new BadRequestError("Valid account ID and role are required");
    }
    if (actorAccountId === accountId && role !== "admin") {
      throw new ForbiddenError("An admin cannot remove their own admin role");
    }
    const [account, profile] = await Promise.all([
      AccountModel.findById(accountId).select("role").lean(),
      UserProfileModel.findOne({ account: accountId }).lean(),
    ]);
    if (!account || !profile) throw new NotFoundError("Account or profile not found");

    if (role === "buyer" && account.role !== "buyer") {
      const [hasProducts, hasDiscounts] = await Promise.all([
        ProductModel.exists({ product_seller: accountId }),
        DiscountModel.exists({ discount_sellerId: accountId }),
      ]);
      if (hasProducts || hasDiscounts) {
        throw new ConflictRequestError(
          "Cannot change this account to buyer while seller-owned data still exists",
        );
      }
    }

    if (role === "seller" && !profile.sellerProfile) {
      if (!sellerProfileInput || typeof sellerProfileInput !== "object") {
        throw new BadRequestError("sellerProfile is required when promoting an account to seller");
      }
      const sellerProfile = sellerProfileInput;
      if (typeof sellerProfile.storeName !== "string" || !sellerProfile.storeName.trim()) {
        throw new BadRequestError("sellerProfile.storeName is required");
      }
      await UserProfileModel.updateOne(
        { account: accountId },
        {
          $set: {
            sellerProfile: {
              storeName: sellerProfile.storeName.trim(),
              description: typeof sellerProfile.description === "string"
                ? sellerProfile.description.trim()
                : "",
            },
          },
        },
        { runValidators: true },
      );
    } else if (role === "buyer") {
      await UserProfileModel.updateOne(
        { account: accountId },
        { $unset: { sellerProfile: 1 } },
      );
    }

    await AccountModel.updateOne(
      { _id: accountId },
      { $set: { role } satisfies { role: AccountRole } },
      { runValidators: true },
    );
    return AccountsService.getAccount(accountId);
  }

  static async updateStatus(actorAccountId: string, accountId: string, status: AccountStatus) {
    if (!Types.ObjectId.isValid(accountId) || !["active", "inactive"].includes(String(status))) {
      throw new BadRequestError("Valid account ID and status are required");
    }
    if (actorAccountId === accountId && status === "inactive") {
      throw new ForbiddenError("An admin cannot deactivate their own account");
    }
    const account = await AccountModel.findByIdAndUpdate(
      accountId,
      { $set: { status } },
      { new: true, runValidators: true },
    ).select(accountFields).populate(profilePopulation).lean();
    if (!account) throw new NotFoundError("Account not found");
    return account;
  }

  static async approveSeller(accountId: string) {
    if (!Types.ObjectId.isValid(accountId)) throw new BadRequestError("Invalid account ID");

    const account = await AccountModel.findOneAndUpdate(
      { _id: accountId, role: "seller", status: "pending" },
      { $set: { status: "active" } },
      { new: true, runValidators: true },
    ).select(accountFields).populate(profilePopulation).lean();

    if (account) return account;

    const existing = await AccountModel.findById(accountId).select("role status").lean();
    if (!existing) throw new NotFoundError("Account not found");
    if (existing.role !== "seller") {
      throw new ConflictRequestError("Only seller registrations can be approved");
    }
    throw new ConflictRequestError("Seller registration is not pending approval");
  }

  static async updateOwnProfile(accountId: string, role: AccountRole, input: UpdateProfileInput) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestError("Profile payload must be an object");
    }
    const source = input;
    const update: Record<string, string> = {};
    for (const field of ["name", "avatarUrl", "phone"] as const) {
      if (source[field] !== undefined) {
        if (typeof source[field] !== "string") {
          throw new BadRequestError(`${field} must be a string`);
        }
        const value = source[field].trim();
        if (field === "name" && !value) throw new BadRequestError("name cannot be empty");
        update[field] = value;
      }
    }
    if (source.sellerProfile !== undefined) {
      if (!hasMinimumRole(role, "seller")) {
        throw new ForbiddenError("Only seller accounts can update seller profile fields");
      }
      if (
        !source.sellerProfile ||
        typeof source.sellerProfile !== "object" ||
        Array.isArray(source.sellerProfile)
      ) {
        throw new BadRequestError("sellerProfile must be an object");
      }
      const sellerProfile = source.sellerProfile;
      if (sellerProfile.storeName !== undefined) {
        if (typeof sellerProfile.storeName !== "string" || !sellerProfile.storeName.trim()) {
          throw new BadRequestError("sellerProfile.storeName cannot be empty");
        }
        update["sellerProfile.storeName"] = sellerProfile.storeName.trim();
      }
      if (sellerProfile.description !== undefined) {
        if (typeof sellerProfile.description !== "string") {
          throw new BadRequestError("sellerProfile.description must be a string");
        }
        update["sellerProfile.description"] = sellerProfile.description.trim();
      }
    }
    if (!Object.keys(update).length) throw new BadRequestError("No supported profile fields to update");
    const profile = await UserProfileModel.findOneAndUpdate(
      { account: accountId },
      { $set: update },
      { new: true, runValidators: true },
    ).select("name avatarUrl phone sellerProfile").lean();
    if (!profile) throw new NotFoundError("User profile not found");
    return profile;
  }
}
