"use strict";

import { parseCredentials, parseSignUpPayload } from "#/auth/validation.js";
import type { AccountRole } from "#/auth/roles.js";
import { createAccessToken } from "#/auth/token.js";
import config from "#/configs/index.js";
import {
  AuthFailureError,
  ConflictRequestError,
  ErrorResponse,
  ForbiddenError,
  InternalServerError,
} from "#/core/error.response.js";
import log from "#/helpers/logger.js";
import { AccountModel } from "#/models/account.model.js";
import { AuthSessionModel } from "#/models/authSession.model.js";
import { UserProfileModel } from "#/models/userProfile.model.js";
import AuthSessionService from "#/services/authSession.service.js";
import {
  findActiveAccountById,
  findByEmailForAuthentication,
} from "#/models/repositories/account.repo.js";
import bcrypt from "bcrypt";

type PublicSignUpRole = Exclude<AccountRole, "admin">;
const FALLBACK_PASSWORD_HASH =
  "$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.";

const presentProfile = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  return {
    _id: profile._id,
    name: profile.name,
    avatarUrl: profile.avatarUrl ?? "",
    phone: profile.phone ?? "",
    ...(profile.sellerProfile ? { sellerProfile: profile.sellerProfile } : {}),
  };
};

const presentAccount = (account: {
  _id: unknown;
  email: string;
  role: AccountRole;
  status: "active" | "inactive";
  verified: boolean;
  profile?: unknown;
}) => ({
  _id: account._id,
  email: account.email,
  role: account.role,
  status: account.status,
  verified: account.verified,
  profile: presentProfile(account.profile),
});

export default class AuthService {
  static signup = async (input: unknown, role: PublicSignUpRole) => {
    const payload = parseSignUpPayload(input, role);
    let createdAccountId: string | undefined;

    try {
      if (await AccountModel.exists({ email: payload.email })) {
        throw new ConflictRequestError("Email is already taken");
      }

      const password = await bcrypt.hash(payload.password, config.auth.bcryptSaltRounds);
      const account = await AccountModel.create({
        email: payload.email,
        password,
        role,
        status: "active",
      });
      createdAccountId = account._id.toString();
      const profile = await UserProfileModel.create({
        account: account._id,
        name: payload.name,
        sellerProfile: payload.sellerProfile,
      });
      const session = await AuthService.createSession(createdAccountId);

      return {
        account: presentAccount({
          ...account.toObject(),
          profile: profile.toObject(),
        }),
        ...session,
      };
    } catch (error) {
      if (createdAccountId) await AuthService.rollback(createdAccountId);
      if (error instanceof ErrorResponse) throw error;
      if (
        error instanceof Error &&
        "code" in error &&
        (error as Error & { code?: number }).code === 11000
      ) {
        throw new ConflictRequestError("Email is already taken");
      }
      log.error("AuthService.signup", error, { email: payload.email, role });
      throw new InternalServerError("Unable to create account", undefined, error);
    }
  };

  static login = async (input: unknown) => {
    const { email, password } = parseCredentials(input);
    const account = await findByEmailForAuthentication(email);
    const matches = await bcrypt.compare(password, account?.password ?? FALLBACK_PASSWORD_HASH);
    if (!account || !matches) throw new AuthFailureError("Invalid email or password");
    if (account.status !== "active") throw new ForbiddenError("Account is inactive");

    const session = await AuthService.createSession(account._id.toString());
    return { account: presentAccount(account), ...session };
  };

  static logout = async (sessionId: string): Promise<void> => {
    await AuthSessionService.revokeById(sessionId);
  };

  static handleRefreshToken = async (refreshToken: string) => {
    const rotated = await AuthSessionService.rotate(refreshToken);
    const accountId = String(rotated.session.account);
    if (!(await findActiveAccountById(accountId))) {
      await AuthSessionService.revokeById(String(rotated.session._id));
      throw new AuthFailureError("Account is unavailable");
    }
    return {
      accessToken: createAccessToken({ accountId, sessionId: String(rotated.session._id) }),
      refreshToken: rotated.refreshToken,
    };
  };

  private static async createSession(accountId: string) {
    const { session, refreshToken } = await AuthSessionService.create(accountId);
    return {
      accessToken: createAccessToken({ accountId, sessionId: String(session._id) }),
      refreshToken,
    };
  }

  private static async rollback(accountId: string): Promise<void> {
    const results = await Promise.allSettled([
      UserProfileModel.deleteOne({ account: accountId }),
      AccountModel.deleteOne({ _id: accountId }),
      AuthSessionModel.deleteMany({ account: accountId }),
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        log.error("AuthService.rollback", result.reason, { accountId });
      }
    }
  }
}
