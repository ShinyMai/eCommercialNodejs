"use strict";

import { AccountModel } from "#/models/account.model.js";

const profilePopulation = {
  path: "profile",
  select: "name avatarUrl phone sellerProfile",
};

export const findByEmailForAuthentication = (email: string) =>
  AccountModel.findOne({ email })
    .select("+password email role status verified")
    .populate(profilePopulation)
    .lean();

export const findActiveAccountById = (accountId: string) =>
  AccountModel.findOne({ _id: accountId, status: "active" })
    .select("_id role")
    .lean();

export { profilePopulation };
