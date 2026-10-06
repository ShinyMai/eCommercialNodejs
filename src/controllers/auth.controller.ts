import type { Request, Response } from "express";
import config from "#/configs/index.js";
import { AuthFailureError } from "#/core/error.response.js";
import { SuccessResponse } from "#/core/success.response.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import AuthService from "#/services/auth.service.js";
import type { CredentialsInput, SignUpInput } from "#/validators/auth.validator.js";

type AuthResult = Awaited<ReturnType<typeof AuthService.login>>;

const refreshCookieOptions = {
  path: config.auth.refreshCookiePath,
  secure: config.isProduction,
  sameSite: "lax" as const,
};

/** Responses carrying credentials must never be cached. */
const setNoStoreHeaders = (res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
};

const setRefreshCookie = (res: Response, refreshToken: string) => {
  res.cookie(config.auth.refreshCookieName, refreshToken, {
    ...refreshCookieOptions,
    httpOnly: true,
    maxAge: config.auth.refreshCookieMaxAgeMs,
  });
};

const clearRefreshCookie = (res: Response) => {
  res.clearCookie(config.auth.refreshCookieName, refreshCookieOptions);
};

/** Prefers the httpOnly cookie; falls back to the body for non-browser clients. */
const readRefreshToken = (req: Request<object, object, { refreshToken?: string }>): string => {
  const bodyToken = req.body && typeof req.body === "object" ? req.body.refreshToken : undefined;
  const token = req.cookies?.[config.auth.refreshCookieName] ?? bodyToken;
  return typeof token === "string" ? token : "";
};

const sendAuthenticatedAccount = (res: Response, result: AuthResult, { created = false } = {}) => {
  setNoStoreHeaders(res);
  setRefreshCookie(res, result.refreshToken);
  const payload = {
    message: created ? "Account created successfully" : "Logged in successfully",
    items: { account: result.account, accessToken: result.accessToken },
  };
  return created ? SuccessResponse.created(res, payload) : SuccessResponse.ok(res, payload);
};

class AuthController {
  static async signupBuyer(req: Request<object, object, SignUpInput>, res: Response) {
    return sendAuthenticatedAccount(res, await AuthService.signupBuyer(req.body), { created: true });
  }

  static async registerSeller(req: Request<object, object, SignUpInput>, res: Response) {
    const result = await AuthService.registerSeller(req.body);
    setNoStoreHeaders(res);
    return SuccessResponse.created(res, {
      message: "Seller registration submitted and is pending admin approval",
      items: result,
    });
  }

  static async login(req: Request<object, object, CredentialsInput>, res: Response) {
    return sendAuthenticatedAccount(res, await AuthService.login(req.body));
  }

  static async refresh(req: Request<object, object, { refreshToken?: string }>, res: Response) {
    let result;
    try {
      result = await AuthService.handleRefreshToken(readRefreshToken(req));
    } catch (error) {
      if (error instanceof AuthFailureError) clearRefreshCookie(res);
      throw error;
    }

    setNoStoreHeaders(res);
    setRefreshCookie(res, result.refreshToken);
    return SuccessResponse.ok(res, {
      message: "Token refreshed successfully",
      items: { accessToken: result.accessToken },
    });
  }

  static async logout(req: AuthenticatedRequest, res: Response) {
    await AuthService.logout(req.auth.sessionId);
    clearRefreshCookie(res);
    return SuccessResponse.ok(res, { message: "Logged out successfully", items: null });
  }
}

export default AuthController;
