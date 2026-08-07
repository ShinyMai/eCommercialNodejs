"use strict";

import mongoose from "mongoose";
import { IDatabase } from "@/dbs/interfaces/db.interface.js";
import config from "@/configs/config.mongodb.js";
import log from "@/helpers/logger.js";

const isDev = (process.env.NODE_ENV || "dev") !== "prod";

class MongoDB implements IDatabase {
  private static instance: MongoDB;
  private readonly connectString: string = `mongodb://${config.db.host}:${config.db.port}/${config.db.name}`;

  private constructor() {
    this.connect();
  }

  connect(): void {
    if (isDev) {
      mongoose.set("debug", true);
      mongoose.set("debug", { color: true });
    }

    mongoose
      .connect(this.connectString)
      .then(() =>
        log.info(`DB connected [${process.env.NODE_ENV || "dev"}]`, {
          db: config.db.name,
        }),
      )
      .catch((e) => log.error("MongoDB.connect", e, { db: config.db.name }));
  }

  static getInstance() {
    if (!MongoDB.instance) {
      MongoDB.instance = new MongoDB();
    }
    return MongoDB.instance;
  }
}

export default MongoDB;
