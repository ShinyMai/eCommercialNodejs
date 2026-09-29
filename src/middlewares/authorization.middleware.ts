"use strict";

import { hasMinimumRole, type AccountRole } from "#/auth/roles.js";
import { ForbiddenError } from "#/core/error.response.js";
import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";

export const requireMinimumRole = (requiredRole: AccountRole) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const authenticatedRequest = req as AuthenticatedRequest;
    if (!hasMinimumRole(authenticatedRequest.auth.role, requiredRole)) {
      return next(new ForbiddenError(`${requiredRole} role is required`));
    }
    return next();
  };
