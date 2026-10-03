// Phase 2 / 6 / 7 gates: two unrelated members, a reviewer and a visitor. Direct requests must
// not read pending work, edit someone else's records, reach staff tools or duplicate anything.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { reviewExhibition } from "../lib/exhibitions";
import { setThreadStatus, createThread } from "../lib/discussions";
import { PNG, api, cleanup, makeUser, prisma, uploadFile, type TestUser } from "./helpers";

let alice: TestUser, bola: TestUser, moderator: TestUser, editor: TestUser;
let postId = "", slug = "", uploadId = "";

before(async () => {
  [alice, bola, moderator, editor] = await Promise.all([makeUser("alice"), makeUser("bola"), makeUser("mod", ["MODERATOR"]), makeUser("editor", ["EDITOR"])]);
});
after(cleanup);

test("uploads: a file whose bytes don't match its type is rejected and removed", async () => {
  const fake = await uploadFile(alice, "EXHIBITION_MEDIA", "image/jpeg", PNG);
  assert.equal(fake.status, 400);
  const oversize = await api(alice, "/api/uploads", { json: { purpose: "EXHIBITION_MEDIA", mime: "image/png", size: 11 * 1024 * 1024 } });
  assert.equal(oversize.status, 413);
  const wrongType = await api(alice, "/api/uploads", { json: { purpose: "EXHIBITION_MEDIA", mime: "image/gif", size: 100 } });
  assert.equal(wrongType.status, 400);
  assert.equal((await api(null, "/api/uploads", { json: { purpose: "EXHIBITION_MEDIA", mime: "image/png", size: 100 } })).status, 401);
});

test("exhibitions: a member submits real media and it stays private until approved", async () => {
  const upload = await uploadFile(alice, "EXHIBITION_MEDIA", "image/png", PNG);
  assert.equal(upload.status, 200, upload.error);
  uploadId = upload.uploadId!;

  const res = await api(alice, "/api/exhibitions", { json: { intent: "submit", title: "Access test project", description: "A description that is long enough to be submitted for review.", topic: "AI & Data", stage: "PROTOTYPE", media: [{ uploadId, alt: "A single test pixel", width: 1, height: 1 }] } });
  const body = await res.json();
  assert.equal(res.status, 201, body.error);
  assert.equal(body.status, "PENDING");
  postId = body.id; slug = body.slug;

  // Pending: the page and the media are hidden from a visitor and from another member.
  assert.equal((await api(null, `/exhibitions/${slug}`)).status, 404);
  assert.equal((await api(bola, `/exhibitions/${slug}`)).status, 404);
  assert.equal((await api(null, `/api/media/${uploadId}`)).status, 404);
  assert.equal((await api(bola, `/api/media/${uploadId}`)).status, 404);
  // The author and a reviewer can see it.
  assert.equal((await api(alice, `/api/media/${uploadId}`)).status, 200);
  assert.equal((await api(moderator, `/api/media/${uploadId}`)).status, 200);
  // Pending posts take no comments or reactions.
  assert.equal((await api(bola, `/api/exhibitions/${postId}/comments`, { json: { body: "hello" } })).status, 404);
});

test("exhibitions: another member cannot edit, withdraw or delete the post, or reuse its media", async () => {
  const edit = await api(bola, `/api/exhibitions/${postId}`, { method: "PATCH", json: { intent: "draft", title: "Hijacked title", media: [] } });
  assert.equal(edit.status, 403);
  assert.equal((await api(bola, `/api/exhibitions/${postId}`, { method: "PATCH", json: { intent: "withdraw" } })).status, 400);
  assert.equal((await api(bola, `/api/exhibitions/${postId}`, { method: "DELETE" })).status, 403);
  const steal = await api(bola, "/api/exhibitions", { json: { intent: "draft", title: "Stolen media", media: [{ uploadId, alt: "not mine" }] } });
  assert.equal(steal.status, 400);
  assert.equal((await prisma.exhibition.findUniqueOrThrow({ where: { id: postId } })).title, "Access test project");
});

test("exhibitions: only a reviewer can approve, and a rejection needs a reason", async () => {
  assert.equal((await reviewExhibition(bola.viewer, postId, "approve", "")).ok, false);
  assert.equal((await reviewExhibition(editor.viewer, postId, "approve", "")).ok, false, "an editor is not a reviewer");
  assert.equal((await reviewExhibition(moderator.viewer, postId, "reject", "")).ok, false, "reason required");
  assert.equal((await reviewExhibition(moderator.viewer, postId, "approve", "")).ok, true);
  assert.equal((await api(null, `/exhibitions/${slug}`)).status, 200);
  assert.equal((await api(null, `/api/media/${uploadId}`)).status, 200);
});

test("exhibitions: two members react and comment without duplicate counts", async () => {
  for (const user of [alice, bola]) assert.equal((await api(user, `/api/exhibitions/${postId}/reactions`, { json: { emoji: "👍" } })).status, 200);
  // Repeating and changing a reaction never adds a second row for the same person.
  await api(bola, `/api/exhibitions/${postId}/reactions`, { json: { emoji: "👍" } });
  await api(bola, `/api/exhibitions/${postId}/reactions`, { json: { emoji: "🎉" } });
  assert.equal(await prisma.exhibitionReaction.count({ where: { exhibitionId: postId } }), 2);
  assert.equal((await api(bola, `/api/exhibitions/${postId}/reactions`, { method: "DELETE" })).status, 200);
  assert.equal(await prisma.exhibitionReaction.count({ where: { exhibitionId: postId } }), 1);
  assert.equal((await api(null, `/api/exhibitions/${postId}/reactions`, { json: { emoji: "👍" } })).status, 401);

  const comment = await api(bola, `/api/exhibitions/${postId}/comments`, { json: { body: "<script>alert(1)</script> Nice work" } });
  assert.equal(comment.status, 201);
  const { comment: created } = await comment.json();
  // Stored as text and rendered as text: the page contains the escaped form, never a live tag.
  const html = await (await api(null, `/exhibitions/${slug}`)).text();
  assert.ok(!html.includes("<script>alert(1)</script>"));
  // Alice can't remove Bola's comment; Bola and a moderator can.
  assert.equal((await api(alice, `/api/exhibitions/${postId}/comments/${created.id}`, { method: "DELETE" })).status, 404);
  assert.equal((await api(moderator, `/api/exhibitions/${postId}/comments/${created.id}`, { method: "DELETE" })).status, 200);
});

test("exhibitions: an edit to an approved post waits for review while the approved version stays public", async () => {
  const edit = await api(alice, `/api/exhibitions/${postId}`, { method: "PATCH", json: { intent: "submit", title: "Edited title awaiting review", description: "A description that is long enough to be submitted for review.", topic: "AI & Data", stage: "TESTED", media: [{ uploadId, alt: "A single test pixel" }] } });
  assert.equal(edit.status, 200);
  const row = await prisma.exhibition.findUniqueOrThrow({ where: { id: postId } });
  assert.equal(row.title, "Access test project");
  assert.equal(row.revisionStatus, "PENDING");
  assert.equal((await reviewExhibition(moderator.viewer, postId, "approve-revision", "")).ok, true);
  assert.equal((await prisma.exhibition.findUniqueOrThrow({ where: { id: postId } })).title, "Edited title awaiting review");
});

test("exhibitions: removal by a moderator takes the page and its media out of public view", async () => {
  assert.equal((await reviewExhibition(moderator.viewer, postId, "remove", "Test removal reason")).ok, true);
  assert.equal((await api(null, `/exhibitions/${slug}`)).status, 404);
  assert.equal((await api(null, `/api/media/${uploadId}`)).status, 404);
  const list = await (await api(null, "/exhibitions")).text();
  assert.ok(!list.includes("Edited title awaiting review"));
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "exhibition.remove", targetId: postId, reason: "Test removal reason" } }));
});

test("discussion: retries don't duplicate, locked threads reject messages, hosts control only their own thread", async () => {
  const threadId = await createThread(alice.viewer, { title: "Access test thread", topic: "Other", body: "An opening message for the access test thread.", referenceUrl: null });
  const send = () => api(bola, `/api/threads/${threadId}/messages`, { json: { body: "Same message, sent twice", clientId: "retry-test-0001" } });
  const [first, second] = await Promise.all([send(), send()]);
  assert.ok([200, 201].includes(first.status) && [200, 201].includes(second.status));
  assert.equal((await (await send()).json()).message.id, (await first.json()).message.id);
  assert.equal(await prisma.threadMessage.count({ where: { threadId } }), 1);

  assert.equal((await api(null, `/api/threads/${threadId}/messages`, { json: { body: "hi", clientId: "visitor-0001" } })).status, 401);
  assert.equal((await api(null, `/discussion/${threadId}`)).status, 200, "visitors can read");

  const message = await prisma.threadMessage.findFirstOrThrow({ where: { threadId } });
  // Bola hosts nothing here: he can't lock Alice's thread; Alice (host) can remove his message.
  assert.equal((await setThreadStatus(threadId, bola.viewer, "LOCKED")).ok, false);
  assert.equal((await api(alice, `/api/threads/${threadId}/messages/${message.id}`, { method: "PATCH", json: { body: "edited by someone else" } })).status, 403);
  assert.equal((await setThreadStatus(threadId, alice.viewer, "LOCKED")).ok, true);
  assert.equal((await api(bola, `/api/threads/${threadId}/messages`, { json: { body: "after lock", clientId: "after-lock-0001" } })).status, 409);
  assert.equal((await setThreadStatus(threadId, alice.viewer, "ARCHIVED")).ok, false, "hosts can't archive");
  assert.equal((await setThreadStatus(threadId, moderator.viewer, "ARCHIVED", "Archived by the test")).ok, true);
  assert.equal((await api(null, `/discussion/${threadId}`)).status, 404);
});

test("audio rooms: nobody can start, join or control a room they shouldn't", async () => {
  const thread = await prisma.thread.create({ data: { hostId: alice.id, title: "Room test", topic: "Other", body: "Room test channel" } });
  const room = await prisma.audioRoom.create({ data: { hostId: alice.id, threadId: thread.id, title: "Room test", description: "Room test", topic: "Other", startsAt: new Date(), timezone: "UTC" } });
  const act = (user: TestUser | null, action: string, userId?: string) => api(user, `/api/rooms/${room.id}/action`, { json: { action, userId } });
  assert.equal((await act(bola, "start")).status, 403, "only the host starts a room");
  assert.equal((await api(bola, `/api/rooms/${room.id}/join`, { method: "POST" })).status, 409, "can't join before it is live");
  assert.equal((await api(null, `/api/rooms/${room.id}/join`, { method: "POST" })).status, 401);

  // Make it live directly (the audio service itself is exercised separately) and check controls.
  await prisma.audioRoom.update({ where: { id: room.id }, data: { status: "LIVE", startedAt: new Date(), hostLastSeenAt: new Date() } });
  await prisma.audioRoomMember.createMany({ data: [{ roomId: room.id, userId: alice.id, role: "HOST" }, { roomId: room.id, userId: bola.id, role: "LISTENER" }] });
  assert.equal((await act(bola, "approve", bola.id)).status, 403, "a listener can't promote themselves");
  assert.equal((await act(bola, "end")).status, 403);
  assert.equal((await act(bola, "remove", alice.id)).status, 403);
  assert.equal((await act(bola, "request")).status, 200);
  assert.equal((await prisma.audioRoomMember.findFirstOrThrow({ where: { roomId: room.id, userId: bola.id } })).role, "LISTENER");
  assert.equal((await act(alice, "remove", bola.id)).status, 200);
  assert.equal((await api(bola, `/api/rooms/${room.id}/join`, { method: "POST" })).status, 403, "a removed member can't get a new token");
  assert.equal((await act(alice, "end")).status, 200);
  assert.equal((await api(alice, `/api/rooms/${room.id}/join`, { method: "POST" })).status, 409, "an ended room can't be entered");
});

test("staff tools: members get nothing, and each staff role sees only its own pages", async () => {
  assert.equal((await api(null, "/admin")).status, 307);
  for (const path of ["/admin", "/admin/exhibitions", "/admin/sponsorship", "/admin/users", "/admin/operations"]) assert.equal((await api(alice, path)).status, 404, path);
  assert.equal((await api(moderator, "/admin/exhibitions")).status, 200);
  for (const path of ["/admin/sponsorship", "/admin/users", "/admin/mentorship", "/admin/content", "/admin/settings"]) assert.equal((await api(moderator, path)).status, 404, `moderator ${path}`);
  assert.equal((await api(editor, "/admin/content")).status, 200);
  assert.equal((await api(editor, "/admin/exhibitions")).status, 404);
  assert.equal((await api(alice, "/admin/operations/export?type=volunteers")).status, 403);
  assert.equal((await api(moderator, "/admin/operations/export?type=volunteers")).status, 403);
  // A suspended account loses access at once, even with a valid session cookie.
  await prisma.user.update({ where: { id: editor.id }, data: { suspendedAt: new Date() } });
  assert.equal((await api(editor, "/admin/content")).status, 307);
});

test("search and indexing: private pages stay out of the sitemap and jobs need the secret", async () => {
  const sitemap = await (await api(null, "/sitemap.xml")).text();
  assert.ok(!sitemap.includes("/admin") && !sitemap.includes("/account"));
  assert.ok(!sitemap.includes(slug), "a removed post is not listed");
  assert.equal((await api(null, "/api/jobs", { method: "POST" })).status, 404);
});
