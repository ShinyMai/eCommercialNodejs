import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import config from "#/configs/index.js";
import { morganStream } from "#/configs/logger.config.js";
import requestIdMiddleware from "#/middlewares/requestId.middleware.js";
import { errorHandler, notFoundHandler } from "#/middlewares/errorHandler.middleware.js";
import router from "#/routes/index.js";

const app = express();

if (config.app.trustProxy) app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(requestIdMiddleware);
app.use(morgan(config.isProduction ? "combined" : "dev", { stream: morganStream }));
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: config.app.jsonLimit }));
app.use(cookieParser());

app.use(config.app.apiPrefix, router);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
