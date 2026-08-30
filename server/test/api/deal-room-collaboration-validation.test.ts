import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptDealRoomInvitationSchema,
  createDealRoomCommentSchema,
  createDealRoomInvitationSchema,
  dealRoomVoteSchema,
  parseBody,
} from "../../src/api/validation";

test("Deal Room invitations normalize email and support contributor/viewer roles", () => {
  assert.deepEqual(
    parseBody(createDealRoomInvitationSchema, {
      email: "  Buyer@Example.COM ",
      role: "contributor",
    }),
    { email: "buyer@example.com", role: "contributor" },
  );
  assert.deepEqual(parseBody(createDealRoomInvitationSchema, { email: "viewer@example.com" }), {
    email: "viewer@example.com",
    role: "viewer",
  });
  assert.throws(() =>
    parseBody(createDealRoomInvitationSchema, {
      email: "viewer@example.com",
      role: "owner",
    }),
  );
});

test("Deal Room collaboration inputs reject malformed or oversized values", () => {
  assert.equal(
    parseBody(acceptDealRoomInvitationSchema, { token: `  ${"a".repeat(32)}  ` }).token.length,
    32,
  );
  assert.deepEqual(parseBody(dealRoomVoteSchema, { prefer: true }), { prefer: true });
  assert.deepEqual(
    parseBody(createDealRoomCommentSchema, { body: "  Check the return policy  " }),
    {
      body: "Check the return policy",
    },
  );
  assert.throws(() => parseBody(acceptDealRoomInvitationSchema, { token: "short" }));
  assert.throws(() => parseBody(createDealRoomCommentSchema, { body: " ".repeat(2) }));
  assert.throws(() => parseBody(createDealRoomCommentSchema, { body: "x".repeat(2_001) }));
});
