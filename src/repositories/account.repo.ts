import type { ClientSession, QueryFilter, Types } from "mongoose";
import type { AccountRole } from "#/auth/roles.js";
import { AccountModel, type Account } from "#/models/account.model.js";
import { withSession } from "#/utils/mongo.js";

export const profilePopulation = {
  path: "profile",
  select: "name avatarUrl phone sellerProfile",
};

/** Public account fields returned by account APIs. */
const ACCOUNT_FIELDS = "email role status verified createdAt updatedAt";

/** Roles allowed to own products. */
export const SELLING_ROLES: AccountRole[] = ["seller", "admin"];

export const findByEmailForAuthentication = (email: string) =>
  AccountModel.findOne({ email })
    .select("+password email role status verified")
    .populate(profilePopulation)
    .lean();

export const findActiveAccountById = (accountId: string) =>
  AccountModel.findOne({ _id: accountId, status: "active" }).select("_id role").lean();

export const findAccountWithProfile = (accountId: string) =>
  AccountModel.findById(accountId).select(ACCOUNT_FIELDS).populate(profilePopulation).lean();

export const findAccountsWithProfile = (filter: QueryFilter<Account>, { skip, limit }: { skip: number; limit: number }) =>
  AccountModel.find(filter)
    .select(ACCOUNT_FIELDS)
    .populate(profilePopulation)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

/** Atomically updates the first account matching `filter` and returns it with its profile. */
export const updateAccountWithProfile = (filter: QueryFilter<Account>, update: Partial<Account>) =>
  AccountModel.findOneAndUpdate(filter, { $set: update }, { new: true, runValidators: true })
    .select(ACCOUNT_FIELDS)
    .populate(profilePopulation)
    .lean();

export const countActiveSellers = (sellerIds: string[], session?: ClientSession) =>
  withSession(
    AccountModel.countDocuments({ _id: { $in: sellerIds }, role: { $in: SELLING_ROLES }, status: "active" }),
    session,
  ).exec();

export const activeSellerExists = (sellerId: Types.ObjectId | string) =>
  AccountModel.exists({ _id: sellerId, role: { $in: SELLING_ROLES }, status: "active" });
