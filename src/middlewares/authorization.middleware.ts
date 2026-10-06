import type { NextFunction, Request, Response } from "express";
import { hasMinimumRole, type AccountRole } from "#/auth/roles.js";
import { ForbiddenError } from "#/core/error.response.js";
import { authentication, type AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";

export const requireMinimumRole = (requiredRole: AccountRole) => (req: Request, _res: Response, next: NextFunction) => {
  const { role } = (req as AuthenticatedRequest).auth;
  if (!hasMinimumRole(role, requiredRole)) return next(new ForbiddenError(`${requiredRole} role is required`));
  return next();
};

/** Authenticates the request, then enforces a minimum role. */
export const authorize = (requiredRole: AccountRole) => [authentication, requireMinimumRole(requiredRole)];
