import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import router from "#/routes/index.js";
import requestIdMiddleware, {
  RequestWithId,
} from "#/middlewares/requestId.middleware.js";
import { morganStream } from "#/configs/logger.config.js";
import log from "#/helpers/logger.js";
import { ErrorResponse, NotFoundError } from "#/core/error.response.js";
import { normalizeError } from "#/core/error.normalizer.js";
import config from "#/configs/index.js";

const app = express();

if (config.app.trustProxy) app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(requestIdMiddleware);
app.use(
  morgan(config.isProduction ? "combined" : "dev", { stream: morganStream }),
);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: config.app.jsonLimit }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(config.app.apiPrefix, router);

//handling errors
app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  },
);

app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const requestId = (req as RequestWithId).requestId;

    const normalized = normalizeError(error);

    const isKnownError = normalized instanceof ErrorResponse;
    const statusCode = isKnownError ? normalized.status : 500;
    const isOperational = isKnownError ? normalized.isOperational : false;

    if (isOperational) {
      log.warn(`${req.method} ${req.originalUrl} -> ${statusCode}`, {
        requestId,
        message: (normalized as Error)?.message,
      });
    } else {
      log.error(`${req.method} ${req.originalUrl}`, error, { requestId });
    }

    const clientMessage = isOperational
      ? (normalized as Error).message
      : "Internal Server Error";

    return res.status(statusCode).json({
      status: "error",
      code: statusCode,
      message: clientMessage,
      requestId,
      timestamp: new Date().toISOString(),
    });
  },
);

export default app;
