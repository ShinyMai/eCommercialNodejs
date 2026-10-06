import { type QueryFilter, Types } from "mongoose";
import { hasMinimumRole, isAccountRole, type AccountRole } from "#/auth/roles.js";
import { BadRequestError, ConflictRequestError, ForbiddenError, NotFoundError } from "#/core/error.response.js";
import { AccountModel, isAccountStatus, type Account, type AccountStatus } from "#/models/account.model.js";
import { DiscountModel } from "#/models/discount.model.js";
import { ProductModel } from "#/models/product.model.js";
import { UserProfileModel } from "#/models/userProfile.model.js";
import {
  findAccountsWithProfile,
  findAccountWithProfile,
  updateAccountWithProfile,
} from "#/repositories/account.repo.js";
import {
  parseNewSellerProfile,
  parseProfileUpdate,
  type SellerProfileInput,
  type UpdateProfileInput,
} from "#/validators/account.validator.js";

export type {
  SellerProfileInput,
  UpdateProfileInput,
  UpdateRoleInput,
  UpdateStatusInput,
} from "#/validators/account.validator.js";

const ADMIN_MANAGEABLE_STATUSES: AccountStatus[] = ["active", "inactive"];

const assertObjectId = (id: string, message: string) => {
  if (!Types.ObjectId.isValid(id)) throw new BadRequestError(message);
};

const assertNoSellerOwnedData = async (accountId: string) => {
  const [hasProducts, hasDiscounts] = await Promise.all([
    ProductModel.exists({ product_seller: accountId }),
    DiscountModel.exists({ discount_sellerId: accountId }),
  ]);
  if (hasProducts || hasDiscounts) {
    throw new ConflictRequestError("Cannot change this account to buyer while seller-owned data still exists");
  }
};

export default class AccountService {
  static async getAccount(accountId: string) {
    assertObjectId(accountId, "Invalid account ID");
    const account = await findAccountWithProfile(accountId);
    if (!account) throw new NotFoundError("Account not found");
    return account;
  }

  static async list({ role, status, page, limit }: { role?: string; status?: string; page: number; limit: number }) {
    const filter: QueryFilter<Account> = {};
    if (role) {
      if (!isAccountRole(role)) throw new BadRequestError("Invalid account role");
      filter.role = role;
    }
    if (status) {
      if (!isAccountStatus(status)) throw new BadRequestError("Invalid account status");
      filter.status = status;
    }

    const [accounts, total] = await Promise.all([
      findAccountsWithProfile(filter, { skip: (page - 1) * limit, limit }),
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

    if (role === "buyer" && account.role !== "buyer") await assertNoSellerOwnedData(accountId);

    if (role === "seller" && !profile.sellerProfile) {
      await UserProfileModel.updateOne(
        { account: accountId },
        { $set: { sellerProfile: parseNewSellerProfile(sellerProfileInput) } },
        { runValidators: true },
      );
    } else if (role === "buyer") {
      await UserProfileModel.updateOne({ account: accountId }, { $unset: { sellerProfile: 1 } });
    }

    await AccountModel.updateOne({ _id: accountId }, { $set: { role } }, { runValidators: true });
    return AccountService.getAccount(accountId);
  }

  static async updateStatus(actorAccountId: string, accountId: string, status: AccountStatus) {
    if (!Types.ObjectId.isValid(accountId) || !ADMIN_MANAGEABLE_STATUSES.includes(status)) {
      throw new BadRequestError("Valid account ID and status are required");
    }
    if (actorAccountId === accountId && status === "inactive") {
      throw new ForbiddenError("An admin cannot deactivate their own account");
    }

    const account = await updateAccountWithProfile({ _id: accountId }, { status });
    if (!account) throw new NotFoundError("Account not found");
    return account;
  }

  static async approveSeller(accountId: string) {
    assertObjectId(accountId, "Invalid account ID");

    const account = await updateAccountWithProfile(
      { _id: accountId, role: "seller", status: "pending" },
      { status: "active" },
    );
    if (account) return account;

    // Explain why the conditional update did not match.
    const existing = await AccountModel.findById(accountId).select("role status").lean();
    if (!existing) throw new NotFoundError("Account not found");
    if (existing.role !== "seller") throw new ConflictRequestError("Only seller registrations can be approved");
    throw new ConflictRequestError("Seller registration is not pending approval");
  }

  static async updateOwnProfile(accountId: string, role: AccountRole, input: UpdateProfileInput) {
    const update = parseProfileUpdate(input, hasMinimumRole(role, "seller"));
    const profile = await UserProfileModel.findOneAndUpdate(
      { account: accountId },
      { $set: update },
      { new: true, runValidators: true },
    )
      .select("name avatarUrl phone sellerProfile")
      .lean();
    if (!profile) throw new NotFoundError("User profile not found");
    return profile;
  }
}
