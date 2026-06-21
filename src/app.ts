import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import DatabaseFactory from "@/dbs/db.factory.js";
import checkOverload from "@/helpers/check.connect.js";
import router from "@/routes/index.js";

const app = express();

//init middleware
app.use(morgan("dev")); //log requests in dev mode
app.use(helmet()); //security headers
app.use(compression()); //reduce response size
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//init db
DatabaseFactory.getDatabase("mongodb");
checkOverload();

//init routes
app.use("", router);

//handling errors

export default app;
