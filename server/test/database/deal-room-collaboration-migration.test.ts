import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260912000000_add_collaborative_deal_rooms.sql",
  "utf8",
);

test("Deal Room collaboration stores members, invitations, votes, comments, and activity", () => {
  assert.match(migration, /create table if not exists public\.deal_room_members/);
  assert.match(
    migration,
    /constraint deal_room_members_role_valid check \(role in \('owner', 'contributor', 'viewer'\)\)/,
  );
  assert.match(migration, /create table if not exists public\.deal_room_invitations/);
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /create table if not exists public\.deal_room_item_votes/);
  assert.match(
    migration,
    /constraint deal_room_item_votes_item_user_unique unique \(item_id, user_id\)/,
  );
  assert.match(migration, /create table if not exists public\.deal_room_comments/);
  assert.match(migration, /char_length\(body\) <= 2_000/);
  assert.match(migration, /create table if not exists public\.deal_room_activity/);
  assert.match(migration, /member_invited/);
  assert.match(migration, /member_joined/);
  assert.match(migration, /item_shortlisted/);
  assert.match(migration, /vote_cast/);
  assert.match(migration, /comment_added/);
});

test("Deal Room collaboration RLS separates read access from contributor mutations", () => {
  assert.match(migration, /create or replace function public\.is_deal_room_member/);
  assert.match(migration, /create or replace function public\.is_deal_room_contributor/);
  assert.match(migration, /create policy deal_rooms_select_owner_or_member_or_public/);
  assert.match(migration, /create policy deal_room_items_insert_contributor/);
  assert.match(migration, /create policy deal_room_items_update_contributor/);
  assert.match(
    migration,
    /create policy deal_room_comments_insert_member[\s\S]*is_deal_room_contributor/,
  );
  assert.match(
    migration,
    /create policy deal_room_item_votes_insert_member[\s\S]*is_deal_room_contributor/,
  );
  assert.match(migration, /create policy deal_room_members_select_member/);
  assert.match(migration, /create trigger deal_rooms_add_owner_membership/);
  assert.match(
    migration,
    /insert into public\.deal_room_members[\s\S]*select id, user_id, 'owner', user_id/,
  );
});
