import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import DatabaseFactory from "@/dbs/db.factory.js";
import checkOverload from "@/helpers/check.connect.js";
import router from "@/routes/index.js";

interface ErrorWithStatus extends Error {
  status?: number;
}

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
app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const error = new Error("Not found") as ErrorWithStatus;
    error.status = 404;
    next(error);
  },
);

app.use(
  (
    error: ErrorWithStatus,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const statusCode = error.status || 500;
    return res.status(statusCode).json({
      status: "error",
      code: statusCode,
      message: error.message,
    });
  },
);

export default app;
