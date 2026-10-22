import { ACCOUNT_ROLES, isAccountRole, type AccountRole } from "#/auth/roles.js";
import { BadRequestError } from "#/core/error.response.js";
import { BROADCAST_TYPES, type BroadcastType } from "#/models/broadcastNotification.model.js";
import type { NotificationType } from "#/models/notification.model.js";
import { validateIdString, validateRecord } from "#/utils/validation.js";

export const NOTIFICATION_TITLE_MAX_LENGTH = 150;
export const NOTIFICATION_CONTENT_MAX_LENGTH = 1000;

export type NotificationData = Record<string, string | number | boolean | null>;

export interface PushPayload {
  noti_type: NotificationType;
  noti_to: string;
  noti_sender: string | null;
  noti_title: string;
  noti_content: string;
  noti_data: NotificationData;
}

export interface BroadcastPayload {
  noti_type: BroadcastType;
  noti_title: string;
  noti_content: string;
  noti_data: NotificationData;
  noti_audience: AccountRole[];
  publish_at: Date;
  expire_at: Date | null;
}

const validateText = (value: unknown, field: string, maxLength: number) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new BadRequestError(`${field} is required`);
  if (text.length > maxLength) throw new BadRequestError(`${field} must be at most ${maxLength} characters`);
  return text;
};

const validateDate = (value: unknown, field: string) => {
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime())) throw new BadRequestError(`${field} must be a valid date`);
  return date;
};

/** Flat key/value data only: the client uses it to navigate, not to render arbitrary content. */
const validateData = (value: unknown): NotificationData => {
  if (value === undefined || value === null) return {};
  const record = validateRecord(value, "noti_data");
  for (const [key, entry] of Object.entries(record)) {
    if (entry !== null && !["string", "number", "boolean"].includes(typeof entry)) {
      throw new BadRequestError(`noti_data.${key} must be a string, number, boolean or null`);
    }
  }
  return record as NotificationData;
};

const validateAudience = (value: unknown): AccountRole[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every(isAccountRole)) {
    throw new BadRequestError(`noti_audience must be a list of: ${ACCOUNT_ROLES.join(", ")}`);
  }
  return [...new Set(value)];
};

/** The sender always comes from the authenticated admin session, never from the request body. */
export const validateCreateBroadcastPayload = (value: unknown): BroadcastPayload => {
  const body = validateRecord(value, "broadcast payload");

  if (!BROADCAST_TYPES.includes(body.noti_type as BroadcastType)) {
    throw new BadRequestError(`noti_type must be one of: ${BROADCAST_TYPES.join(", ")}`);
  }
  const publishAt = body.publish_at === undefined ? new Date() : validateDate(body.publish_at, "publish_at");
  const expireAt = body.expire_at === undefined || body.expire_at === null ? null : validateDate(body.expire_at, "expire_at");
  if (expireAt && expireAt <= publishAt) throw new BadRequestError("expire_at must be after publish_at");

  return {
    noti_type: body.noti_type as BroadcastType,
    noti_title: validateText(body.noti_title, "noti_title", NOTIFICATION_TITLE_MAX_LENGTH),
    noti_content: validateText(body.noti_content, "noti_content", NOTIFICATION_CONTENT_MAX_LENGTH),
    noti_data: validateData(body.noti_data),
    noti_audience: validateAudience(body.noti_audience),
    publish_at: publishAt,
    expire_at: expireAt,
  };
};

/** Inbox cursor: an ISO timestamp; items strictly older than it are returned. Defaults to now. */
export const validateInboxCursor = (value: unknown): Date =>
  value === undefined || value === "" ? new Date() : validateDate(value, "cursor");

export const validateNotificationId = (value: unknown) => validateIdString(value, "notificationId");
