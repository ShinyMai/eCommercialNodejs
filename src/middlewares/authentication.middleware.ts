"use strict";

import { verifyAccessToken } from "#/auth/token.js";
import { isAccountRole, type AccountRole } from "#/auth/roles.js";
import { AuthFailureError } from "#/core/error.response.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import AuthSessionService from "#/services/authSession.service.js";
import { findActiveAccountById } from "#/models/repositories/account.repo.js";
import type { NextFunction, Request, Response } from "express";

export interface AuthenticatedRequest extends Request {
  auth: {
    accountId: string;
    sessionId: string;
    role: AccountRole;
  };
}

export const authentication = asyncHandler(
  async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const authorization = req.header("authorization");
    const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch?.[1]) throw new AuthFailureError("Missing Bearer access token");

    const payload = verifyAccessToken(bearerMatch[1].trim());
    const [session, account] = await Promise.all([
      AuthSessionService.findActiveById(payload.sid, payload.sub),
      findActiveAccountById(payload.sub),
    ]);
    if (!session || !account || !isAccountRole(account.role)) {
      throw new AuthFailureError("Session is invalid or revoked");
    }

    req.auth = { accountId: payload.sub, sessionId: payload.sid, role: account.role };
    next();
  },
);
