import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import DatabaseFactory from "@/dbs/db.factory.js";
import checkOverload from "@/helpers/check.connect.js";
import router from "@/routes/index.js";
import requestIdMiddleware, {
  RequestWithId,
} from "@/middlewares/requestId.middleware.js";
import { morganStream } from "@/configs/logger.config.js";
import log from "@/helpers/logger.js";
import { ErrorResponse, NotFoundError } from "@/core/error.response.js";
import { normalizeError } from "@/core/error.normalizer.js";

const app = express();

//init middleware
app.use(requestIdMiddleware); // chạy trước morgan để requestId có sẵn khi log request
app.use(morgan("dev", { stream: morganStream })); //log requests, đẩy qua winston
app.use(helmet()); //security headers
app.use(compression()); //reduce response size
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

//init db
DatabaseFactory.getDatabase("mongodb");
checkOverload();

//init routes
app.use("", router);

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: express.NextFunction,
  ) => {
    const requestId = (req as RequestWithId).requestId;

    // Tự động nhận diện lỗi Mongoose/MongoDB quen mặt (duplicate key, validation, cast...)
    // và quy đổi thành đúng ErrorResponse nghiệp vụ trước khi log & trả response.
    const normalized = normalizeError(error);

    const isKnownError = normalized instanceof ErrorResponse;
    const statusCode = isKnownError ? normalized.status : 500;
    const isOperational = isKnownError ? normalized.isOperational : false;

    // Lỗi nghiệp vụ (400/403/404...) -> warn, đủ để biết tần suất mà không làm ồn log error
    // Lỗi hệ thống/bug thật (500, không xác định) -> error, kèm đầy đủ stack trace để điều tra
    if (isOperational) {
      log.warn(`${req.method} ${req.originalUrl} -> ${statusCode}`, {
        requestId,
        message: (normalized as Error)?.message,
      });
    } else {
      // Log lỗi GỐC (chưa normalize) để giữ nguyên stack trace + error.name thật
      // (VD: "MongoServerError", "TypeError"...) phục vụ điều tra, dù response trả
      // về client vẫn dựa trên message đã chuẩn hoá ở dưới.
      log.error(`${req.method} ${req.originalUrl}`, error, { requestId });
    }

    // Với lỗi hệ thống (không operational), KHÔNG trả message/stack gốc ra ngoài
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
