"use strict";

import type { Response } from "express";
import { SuccessResponse } from "#/core/success.response.js";
import log from "#/helpers/logger.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import NotificationService from "#/services/notification.service.js";
import { getPagination } from "#/utils/index.js";

const HEARTBEAT_MS = 25_000;

class NotificationController {
  static async listInbox(req: AuthenticatedRequest, res: Response) {
    const { limit } = getPagination(req.query);
    const { items, next_cursor } = await NotificationService.getInbox(req.auth, { cursor: req.query.cursor, limit });
    return SuccessResponse.ok(res, {
      message: "Notifications retrieved successfully",
      items: { notifications: items, next_cursor },
    });
  }

  static async getUnreadCount(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Unread count retrieved successfully",
      items: await NotificationService.getUnreadCount(req.auth),
    });
  }

  static async markRead(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Notification marked as read",
      items: await NotificationService.markRead(req.auth, String(req.params.id)),
    });
  }

  static async markAllRead(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "All notifications marked as read",
      items: await NotificationService.markAllRead(req.auth),
    });
  }

  static async createBroadcast(req: AuthenticatedRequest<unknown>, res: Response) {
    return SuccessResponse.created(res, {
      message: "Broadcast notification created successfully",
      items: await NotificationService.createBroadcast(req.body, req.auth.accountId),
    });
  }

  /**
   * Server-Sent Events stream. Subscribing happens before headers are sent so a Redis failure
   * still reaches the error handler as a normal JSON error.
   */
  static async stream(req: AuthenticatedRequest, res: Response) {
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const unsubscribe = await NotificationService.subscribe(req.auth, send);

    res.status(200).set({
      "Content-Type": "text/event-stream",
      // no-transform makes compression() skip this response instead of buffering it.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    const close = () => {
      clearInterval(heartbeat);
      unsubscribe().catch((error) => log.error("Notification stream unsubscribe", error));
    };
    res.once("close", close);
    if (res.destroyed) return close();

    // Headers are already sent, so errors from here on are logged instead of reaching the error handler.
    try {
      send("ready", await NotificationService.getUnreadCount(req.auth));
    } catch (error) {
      log.error("Notification stream initial count", error);
    }
  }
}

export default NotificationController;
