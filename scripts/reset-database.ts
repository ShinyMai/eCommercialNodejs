import config from "#/configs/index.js";
import db from "#/configs/mongodb.config.js";
import mongoose from "mongoose";
import { seedDefaultData } from "./default-data.js";

const SYSTEM_DATABASES = new Set(["admin", "config", "local"]);

try {
  if (config.isProduction) throw new Error("Database reset is disabled in production");

  await db.connect();
  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB connection is unavailable");

  const databaseName = database.databaseName;
  if (SYSTEM_DATABASES.has(databaseName)) {
    throw new Error(`Refusing to reset protected MongoDB database: ${databaseName}`);
  }
  if (process.env.RESET_DATABASE_CONFIRM !== databaseName) {
    throw new Error(
      `Set RESET_DATABASE_CONFIRM=${databaseName} to confirm resetting this exact database`,
    );
  }

  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  const removedCollections = collections.map(({ name }) => name).sort();
  await database.dropDatabase();
  const result = await seedDefaultData();

  console.log(JSON.stringify({
    action: "reset-and-seeded",
    removedCollections,
    ...result,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.disconnect().catch(() => undefined);
}
