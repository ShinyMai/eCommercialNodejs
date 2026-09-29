"use strict";

import db from "#/dbs/init.mongodb.js";
import { seedDefaultData } from "./default-data.js";

try {
  await db.connect();
  const result = await seedDefaultData();
  console.log(JSON.stringify({ action: "seeded", ...result }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.disconnect().catch(() => undefined);
}
