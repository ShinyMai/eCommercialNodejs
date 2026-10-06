import bcrypt from "bcrypt";
import type { Types } from "mongoose";
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
import log, { toError } from "#/helpers/logger.js";
import { AccountModel, type AccountStatus } from "#/models/account.model.js";
import { AuthSessionModel } from "#/models/authSession.model.js";
import { UserProfileModel } from "#/models/userProfile.model.js";
import { findActiveAccountById, findByEmailForAuthentication } from "#/repositories/account.repo.js";
import AuthSessionService from "#/services/authSession.service.js";
import type { RuntimeRecord, RuntimeValue } from "#/types/value.types.js";
import { isDuplicateKeyError } from "#/utils/mongo.js";
import {
  parseCredentials,
  parseSignUpPayload,
  type CredentialsInput,
  type SignUpInput,
} from "#/validators/auth.validator.js";

/** Compared against when the email is unknown so login timing does not reveal which emails exist. */
const FALLBACK_PASSWORD_HASH = "$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.";

type SelfServiceRole = Exclude<AccountRole, "admin">;

const presentProfile = (value: RuntimeValue) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const profile = value as RuntimeRecord;
  return {
    _id: profile._id,
    name: profile.name,
    avatarUrl: profile.avatarUrl ?? "",
    phone: profile.phone ?? "",
    ...(profile.sellerProfile ? { sellerProfile: profile.sellerProfile } : {}),
  };
};

const presentAccount = (account: {
  _id: Types.ObjectId;
  email: string;
  role: AccountRole;
  status: AccountStatus;
  verified: boolean;
  profile?: RuntimeValue;
}) => ({
  _id: account._id,
  email: account.email,
  role: account.role,
  status: account.status,
  verified: account.verified,
  profile: presentProfile(account.profile),
});

/** Known business errors pass through; anything else is logged and hidden behind a generic 500. */
const toAccountCreationError = (error: unknown, context: string, meta: RuntimeRecord) => {
  if (error instanceof ErrorResponse) return error;
  if (isDuplicateKeyError(error)) return new ConflictRequestError("Email is already taken");
  log.error(context, error, meta);
  return new InternalServerError("Unable to create account", undefined, toError(error));
};

export default class AuthService {
  static signupBuyer = async (input: SignUpInput) => {
    const account = await AuthService.createAccount(input, "buyer", "active");
    const accountId = String(account._id);

    try {
      return { account, ...(await AuthService.createSession(accountId)) };
    } catch (error) {
      await AuthService.rollback(accountId);
      throw toAccountCreationError(error, "AuthService.signupBuyer", { email: account.email });
    }
  };

  static registerSeller = async (input: SignUpInput) => ({
    account: await AuthService.createAccount(input, "seller", "pending"),
  });

  static login = async (input: CredentialsInput) => {
    const { email, password } = parseCredentials(input);
    const account = await findByEmailForAuthentication(email);
    const matches = await bcrypt.compare(password, account?.password ?? FALLBACK_PASSWORD_HASH);
    if (!account || !matches) throw new AuthFailureError("Invalid email or password");
    if (account.status === "pending") throw new ForbiddenError("Seller registration is pending admin approval");
    if (account.status !== "active") throw new ForbiddenError("Account is inactive");

    const session = await AuthService.createSession(account._id.toString());
    return { account: presentAccount(account), ...session };
  };

  static logout = async (sessionId: string): Promise<void> => {
    await AuthSessionService.revokeById(sessionId);
  };

  static handleRefreshToken = async (refreshToken: string) => {
    const { session, refreshToken: nextRefreshToken } = await AuthSessionService.rotate(refreshToken);
    const accountId = String(session.account);
    const sessionId = String(session._id);

    if (!(await findActiveAccountById(accountId))) {
      await AuthSessionService.revokeById(sessionId);
      throw new AuthFailureError("Account is unavailable");
    }
    return { accessToken: createAccessToken({ accountId, sessionId }), refreshToken: nextRefreshToken };
  };

  private static createAccount = async (input: SignUpInput, role: SelfServiceRole, status: AccountStatus) => {
    const payload = parseSignUpPayload(input, role);
    let createdAccountId: string | undefined;

    try {
      if (await AccountModel.exists({ email: payload.email })) {
        throw new ConflictRequestError("Email is already taken");
      }

      const password = await bcrypt.hash(payload.password, config.auth.bcryptSaltRounds);
      const account = await AccountModel.create({ email: payload.email, password, role, status });
      createdAccountId = account._id.toString();
      const profile = await UserProfileModel.create({
        account: account._id,
        name: payload.name,
        sellerProfile: payload.sellerProfile,
      });
      return presentAccount({ ...account.toObject(), profile: profile.toObject() });
    } catch (error) {
      if (createdAccountId) await AuthService.rollback(createdAccountId);
      throw toAccountCreationError(error, "AuthService.createAccount", { email: payload.email, role, status });
    }
  };

  private static async createSession(accountId: string) {
    const { session, refreshToken } = await AuthSessionService.create(accountId);
    return {
      accessToken: createAccessToken({ accountId, sessionId: String(session._id) }),
      refreshToken,
    };
  }

  /** Best-effort compensation for a partially created account (no multi-document transaction here). */
  private static async rollback(accountId: string): Promise<void> {
    const results = await Promise.allSettled([
      UserProfileModel.deleteOne({ account: accountId }),
      AccountModel.deleteOne({ _id: accountId }),
      AuthSessionModel.deleteMany({ account: accountId }),
    ]);
    for (const result of results) {
      if (result.status === "rejected") log.error("AuthService.rollback", result.reason, { accountId });
    }
  }
}
