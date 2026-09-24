"use strict";

import shopModel from "#/models/shop.model.js";

const findByEmail = async ({
  email,
  select = {
    email: 1,
    password: 1,
    role: 1,
    _id: 1,
  },
}: {
  email: string;
  select?: Record<string, number>;
}) => {
  return shopModel.findOne({ email: email.toLowerCase() }).select(select).lean();
};

export { findByEmail };
