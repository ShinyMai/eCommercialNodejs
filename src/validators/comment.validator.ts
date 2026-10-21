import { BadRequestError } from "#/core/error.response.js";
import { validateIdString, validateRecord } from "#/utils/validation.js";

export const COMMENT_CONTENT_MAX_LENGTH = 2000;

export interface CommentPayload {
  comment_account: string;
  comment_product: string;
  comment_content: string;
  comment_parent: string | null;
}

/** The author always comes from the authenticated session, never from the request body. */
export const validateCreateCommentPayload = (value: unknown, accountId: string): CommentPayload => {
  const body = validateRecord(value, "comment payload");

  const content = typeof body.comment_content === "string" ? body.comment_content.trim() : "";
  if (!content) throw new BadRequestError("comment_content is required");
  if (content.length > COMMENT_CONTENT_MAX_LENGTH) {
    throw new BadRequestError(`comment_content must be at most ${COMMENT_CONTENT_MAX_LENGTH} characters`);
  }

  return {
    comment_account: validateIdString(accountId, "accountId"),
    comment_product: validateIdString(body.comment_product, "comment_product"),
    comment_content: content,
    comment_parent:
      body.comment_parent === undefined || body.comment_parent === null
        ? null
        : validateIdString(body.comment_parent, "comment_parent"),
  };
};
