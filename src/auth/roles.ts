"use strict";

export const ACCOUNT_ROLES = ["buyer", "seller", "admin"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

const ROLE_LEVEL: Record<AccountRole, number> = {
  buyer: 1,
  seller: 2,
  admin: 3,
};

export const hasMinimumRole = (
  actualRole: AccountRole,
  requiredRole: AccountRole,
): boolean => ROLE_LEVEL[actualRole] >= ROLE_LEVEL[requiredRole];

export const isAccountRole = (value: unknown): value is AccountRole =>
  ACCOUNT_ROLES.includes(value as AccountRole);
