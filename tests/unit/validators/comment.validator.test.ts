import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMENT_CONTENT_MAX_LENGTH, validateCreateCommentPayload } from "#/validators/comment.validator.js";

const ACCOUNT = "a".repeat(24);
const PRODUCT = "b".repeat(24);
const PARENT = "c".repeat(24);

test("comment author comes from the session, not the body", () => {
  const payload = validateCreateCommentPayload(
    { comment_account: "d".repeat(24), comment_product: PRODUCT, comment_content: " Hi " },
    ACCOUNT,
  );
  assert.deepEqual(payload, {
    comment_account: ACCOUNT,
    comment_product: PRODUCT,
    comment_content: "Hi",
    comment_parent: null,
  });
});

test("comment parent is optional but must be a valid id", () => {
  const body = { comment_product: PRODUCT, comment_content: "Hi" };
  assert.equal(validateCreateCommentPayload({ ...body, comment_parent: null }, ACCOUNT).comment_parent, null);
  assert.equal(validateCreateCommentPayload({ ...body, comment_parent: PARENT }, ACCOUNT).comment_parent, PARENT);
  assert.throws(() => validateCreateCommentPayload({ ...body, comment_parent: "x" }, ACCOUNT), /comment_parent/);
});

test("comment payload rejects invalid values", () => {
  assert.throws(() => validateCreateCommentPayload(null, ACCOUNT), /Invalid comment payload/);
  assert.throws(() => validateCreateCommentPayload({ comment_product: "x", comment_content: "Hi" }, ACCOUNT), /comment_product/);
  assert.throws(() => validateCreateCommentPayload({ comment_product: PRODUCT, comment_content: "  " }, ACCOUNT), /required/);
  assert.throws(
    () => validateCreateCommentPayload({ comment_product: PRODUCT, comment_content: "x".repeat(COMMENT_CONTENT_MAX_LENGTH + 1) }, ACCOUNT),
    /at most/,
  );
});
