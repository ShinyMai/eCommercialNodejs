"use strict";

import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import { runWithRequestContext } from "#/helpers/request.context.js";

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
  const incomingRequestId = req.header(REQUEST_ID_HEADER);
  const requestId =
    incomingRequestId && /^[a-zA-Z0-9._:-]{1,128}$/.test(incomingRequestId)
      ? incomingRequestId
      : randomUUID();

  (req as RequestWithId).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  runWithRequestContext({ requestId }, () => next());
};

export default requestIdMiddleware;
