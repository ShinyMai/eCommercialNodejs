import { parseSignUpPayload } from "#/validators/auth.validator.js";
import config from "#/configs/index.js";
import db from "#/configs/mongodb.config.js";
import { AccountModel } from "#/models/account.model.js";
import { UserProfileModel } from "#/models/userProfile.model.js";
import bcrypt from "bcrypt";

const run = async () => {
  const payload = parseSignUpPayload({
    name: "admin",
    email: "admin@example.com",
    password: "12345678",
  });

  await db.connect();
  if (await AccountModel.exists({ email: payload.email })) {
    throw new Error("An account with ADMIN_EMAIL already exists; refusing to elevate it automatically");
  }
  const password = await bcrypt.hash(payload.password, config.auth.bcryptSaltRounds);
  const admin = await AccountModel.create({
    email: payload.email,
    password,
    role: "admin",
    status: "active",
    verified: true,
  });
  try {
    await UserProfileModel.create({ account: admin._id, name: payload.name });
    console.log(JSON.stringify({ _id: admin._id, email: admin.email, role: admin.role }, null, 2));
  } catch (error) {
    await AccountModel.deleteOne({ _id: admin._id }).catch(() => undefined);
    throw error;
  }
};

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.disconnect().catch(() => undefined);
}
