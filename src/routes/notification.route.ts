import { Router } from "express";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { authorize } from "#/middlewares/authorization.middleware.js";
import NotificationController from "#/controllers/notification.controller.js";

const router = Router();

router.get("/", authorize("buyer"), asyncHandler(NotificationController.listInbox));
router.get("/unread-count", authorize("buyer"), asyncHandler(NotificationController.getUnreadCount));
router.get("/stream", authorize("buyer"), asyncHandler(NotificationController.stream));
router.patch("/read-all", authorize("buyer"), asyncHandler(NotificationController.markAllRead));
router.patch("/:id/read", authorize("buyer"), asyncHandler(NotificationController.markRead));

router.post("/broadcasts", authorize("admin"), asyncHandler(NotificationController.createBroadcast));

export default router;
