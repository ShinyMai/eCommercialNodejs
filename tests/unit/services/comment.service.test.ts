import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import mongoose from "mongoose";
import type { AccountRole } from "#/auth/roles.js";
import { CommentModel } from "#/models/comment.model.js";
import CommentService from "#/services/comment.service.js";
import NotificationService, { type PushInput } from "#/services/notification.service.js";
import { newId, queryOf } from "../../helpers/fixtures.js";

const productId = newId();

/** The clothing tree from the nested-set diagram, already in `left` order. */
const node = (name: string, comment_left: number, comment_right: number) => ({
  comment_content: name,
  comment_product: productId,
  comment_left,
  comment_right,
});
const CLOTHING = [
  node("Clothing", 1, 22),
  node("Men's", 2, 9),
  node("Suits", 3, 8),
  node("Slacks", 4, 5),
  node("Jackets", 6, 7),
  node("Women's", 10, 21),
  node("Dresses", 11, 16),
  node("Evening Gowns", 12, 13),
  node("Sun Dresses", 14, 15),
  node("Skirts", 17, 18),
  node("Blouses", 19, 20),
];

type Tree = { comment_content: string; replies: Tree[] };
const shape = (tree: Tree): unknown =>
  tree.replies.length ? { [tree.comment_content]: tree.replies.map(shape) } : tree.comment_content;

test("product comments report reply counts, the root total and the total at every depth", async (t) => {
  t.mock.method(CommentModel, "find", () => queryOf([node("Clothing", 1, 22), node("Shoes", 23, 24)]));
  // Roots are filtered by `comment_parent: null`; the all-depth count is not.
  t.mock.method(CommentModel, "countDocuments", (filter: object) => queryOf("comment_parent" in filter ? 7 : 40));

  const { comments, total, totalComments } = await CommentService.getCommentsByProduct(productId, { limit: 2, skip: 0 });
  assert.equal(total, 7);
  assert.equal(totalComments, 40);
  assert.deepEqual(
    comments.map(({ comment_content, reply_count }) => [comment_content, reply_count]),
    [
      ["Clothing", 10],
      ["Shoes", 0],
    ],
  );
});

test("comment thread is rebuilt as a nested tree from the range query", async (t) => {
  t.mock.method(CommentModel, "findOne", () => queryOf(CLOTHING[0]));
  const find = t.mock.method(CommentModel, "find", () => queryOf(CLOTHING));

  const thread = await CommentService.getCommentThread(newId());
  assert.deepEqual(shape(thread as Tree), {
    Clothing: [
      { "Men's": [{ Suits: ["Slacks", "Jackets"] }] },
      { "Women's": [{ Dresses: ["Evening Gowns", "Sun Dresses"] }, "Skirts", "Blouses"] },
    ],
  });
  assert.deepEqual(find.mock.calls[0].arguments[0], {
    comment_product: productId,
    comment_left: { $gte: 1 },
    comment_right: { $lte: 22 },
    is_deleted: false,
  });
});

test("replies of a missing (soft-deleted) comment attach to the nearest ancestor", async (t) => {
  t.mock.method(CommentModel, "findOne", () => queryOf(CLOTHING[1]));
  t.mock.method(CommentModel, "find", () => queryOf(CLOTHING.slice(1, 5).filter((c) => c.comment_content !== "Suits")));

  const thread = await CommentService.getCommentThread(newId());
  assert.deepEqual(shape(thread as Tree), { "Men's": ["Slacks", "Jackets"] });
});

test("load more returns one level of replies, each with its own reply_count", async (t) => {
  const parentId = newId();
  t.mock.method(CommentModel, "findOne", () => queryOf({ ...CLOTHING[5], _id: parentId }));
  const find = t.mock.method(CommentModel, "find", () => queryOf([CLOTHING[6], CLOTHING[9], CLOTHING[10]]));
  t.mock.method(CommentModel, "countDocuments", () => queryOf(3));

  const { comments, total } = await CommentService.getChildComments(parentId, { limit: 10, skip: 0 });
  assert.equal(total, 3);
  assert.deepEqual(
    comments.map(({ comment_content, reply_count }) => [comment_content, reply_count]),
    [
      ["Dresses", 2],
      ["Skirts", 0],
      ["Blouses", 0],
    ],
  );
  assert.deepEqual(find.mock.calls[0].arguments[0], { comment_parent: parentId, is_deleted: false });
});

test("load more rejects a missing parent", async (t) => {
  t.mock.method(CommentModel, "findOne", () => queryOf(null));
  await assert.rejects(CommentService.getChildComments(newId(), { limit: 10, skip: 0 }), { name: "NotFoundError" });
});

type Stored = ReturnType<typeof node> & { comment_account: string };
type Range = { $gte?: number; $lte?: number };
const inRange = (value: number, range?: Range) =>
  !range || ((range.$gte === undefined || value >= range.$gte) && (range.$lte === undefined || value <= range.$lte));
const matches = (c: Stored, filter: { comment_left?: Range; comment_right?: Range }) =>
  inRange(c.comment_left, filter.comment_left) && inRange(c.comment_right, filter.comment_right);

/** Runs deleteComment against an in-memory copy of the clothing tree. */
const deleteFromClothing = async (t: TestContext, target: string, auth: { accountId: string; role: AccountRole }) => {
  const author = newId();
  let rows: Stored[] = CLOTHING.map((c) => ({ ...c, comment_account: author }));
  const session = { withTransaction: async (work: () => Promise<unknown>) => work(), endSession: async () => undefined };
  t.mock.method(mongoose, "startSession", async () => session);
  t.mock.method(CommentModel, "findOne", () => queryOf(rows.find((c) => c.comment_content === target)));
  t.mock.method(CommentModel, "deleteMany", async (filter: Parameters<typeof matches>[1]) => {
    const before = rows.length;
    rows = rows.filter((c) => !matches(c, filter));
    return { deletedCount: before - rows.length };
  });
  t.mock.method(CommentModel, "updateMany", async (filter: Parameters<typeof matches>[1], update: { $inc: Partial<Stored> }) => {
    for (const c of rows.filter((row) => matches(row, filter))) {
      c.comment_left += update.$inc.comment_left ?? 0;
      c.comment_right += update.$inc.comment_right ?? 0;
    }
  });

  const result = await CommentService.deleteComment(newId(), { ...auth, accountId: auth.accountId || author });
  return { result, rows: rows.map((c) => [c.comment_content, c.comment_left, c.comment_right]) };
};

test("deleting a comment removes its replies and closes the gap", async (t) => {
  const { result, rows } = await deleteFromClothing(t, "Men's", { accountId: "", role: "buyer" });
  assert.deepEqual(result, { deleted_count: 4 });
  assert.deepEqual(rows, [
    ["Clothing", 1, 14],
    ["Women's", 2, 13],
    ["Dresses", 3, 8],
    ["Evening Gowns", 4, 5],
    ["Sun Dresses", 6, 7],
    ["Skirts", 9, 10],
    ["Blouses", 11, 12],
  ]);
});

test("only the author or an admin may delete a comment", async (t) => {
  await assert.rejects(deleteFromClothing(t, "Skirts", { accountId: newId(), role: "seller" }), { name: "ForbiddenError" });
  const { result } = await deleteFromClothing(t, "Skirts", { accountId: newId(), role: "admin" });
  assert.deepEqual(result, { deleted_count: 1 });
});

test("deleting a missing comment is reported as not found", async (t) => {
  await assert.rejects(deleteFromClothing(t, "Hats", { accountId: "", role: "buyer" }), { name: "NotFoundError" });
});

test("comment thread rejects unknown or invalid ids", async (t) => {
  t.mock.method(CommentModel, "findOne", () => queryOf(null));
  await assert.rejects(CommentService.getCommentThread(newId()), { name: "NotFoundError" });
  await assert.rejects(CommentService.getCommentThread("x"), /commentId/);
});

test("a reply notifies the parent's author, but replying to yourself does not", async (t) => {
  const parentAuthor = newId();
  const session = { withTransaction: async (work: () => Promise<unknown>) => work(), endSession: async () => undefined };
  t.mock.method(mongoose, "startSession", async () => session);
  t.mock.method(CommentModel, "findOne", () => queryOf({ comment_right: 5, comment_account: parentAuthor }));
  t.mock.method(CommentModel, "updateMany", async () => ({}));
  t.mock.method(CommentModel, "create", async ([payload]: [object]) => [{ ...payload, _id: newId() }]);
  const push = t.mock.method(NotificationService, "push", async (_input: PushInput) => ({}) as any);

  const parentId = newId();
  const replier = newId();
  const reply = await CommentService.createComment(
    { comment_product: productId, comment_parent: parentId, comment_content: "Same here" },
    replier,
  );
  const [input] = push.mock.calls[0].arguments;
  assert.equal(input.type, "comment_reply");
  assert.equal(input.to, parentAuthor);
  assert.equal(input.sender, replier);
  assert.deepEqual(input.data, { productId, commentId: String(reply._id), parentCommentId: parentId });

  await CommentService.createComment(
    { comment_product: productId, comment_parent: parentId, comment_content: "Edit: fixed" },
    parentAuthor,
  );
  assert.equal(push.mock.callCount(), 1);
});
