"use strict";

import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import { runWithRequestContext } from "@/helpers/request.context.js";

const REQUEST_ID_HEADER = "x-request-id";

export interface RequestWithId extends Request {
  requestId: string;
}

/**
 * - Ưu tiên lấy requestId có sẵn từ header (khi request đi qua gateway/service khác)
 *   để trace xuyên suốt nhiều service, nếu không có thì tự sinh mới.
 * - Trả lại requestId trong response header để client/log FE có thể đối chiếu khi báo lỗi.
 */
const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const requestId = (req.headers[REQUEST_ID_HEADER] as string) || randomUUID();

  (req as RequestWithId).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  runWithRequestContext({ requestId }, () => next());
};

export default requestIdMiddleware;
