// Phase 9 gate: application → review → mutual acceptance → milestones → completion, plus the
// three things that must never happen (another mentor reading an application, a withdrawn
// application being activated, capacity exceeded by parallel accepts).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { addMilestone, completeMatch, getApplicationForViewer, getMatchForViewer, proposeMatch, respondToMatch, saveApplication, updateBrief, withdrawApplication } from "../lib/mentorship";
import { api, cleanup, makeUser, prisma, uploadFile, type TestUser } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const application = { interests: "Sensors and field measurement", experience: "Built two data loggers at university", motivation: "I want supervised research experience", goals: "A tested prototype", availability: "8 hours a week", location: "Ibadan" };

let student: TestUser, student2: TestUser, mentor: TestUser, otherMentor: TestUser, coordinator: TestUser;
let opportunityId = "";

/** The id from a result that must have succeeded. */
function idOf(result: { ok: boolean; id?: string }): string {
  assert.ok(result.ok && result.id, "expected the step to succeed");
  return result.id;
}

async function opportunity(capacity: number) {
  const row = await prisma.opportunity.create({ data: { mentorId: mentor.id, title: "Test opportunity", scope: "s", skills: [], learningGoals: "l", duration: "d", hoursPerWeek: "h", location: "x", workingMode: "REMOTE", fundingStatus: "UNFUNDED", topic: "Other", capacity, status: "PUBLISHED" } });
  return row.id;
}

before(async () => {
  [student, student2, mentor, otherMentor, coordinator] = await Promise.all([makeUser("student"), makeUser("student2"), makeUser("mentor"), makeUser("othermentor"), makeUser("coord", ["COORDINATOR"])]);
  opportunityId = await opportunity(1);
});
after(cleanup);

test("full journey: apply, propose, both accept, milestones, complete; documents stay private", async () => {
  const upload = await uploadFile(student, "APPLICATION_DOCUMENT", "application/pdf", PDF);
  assert.equal(upload.status, 200, upload.error);
  const saved = await saveApplication(student.viewer, null, opportunityId, { ...application, documentUploadId: upload.uploadId! }, true);
  const applicationId = idOf(saved);
  assert.ok((await prisma.mentorshipApplication.findUniqueOrThrow({ where: { id: applicationId } })).submittedVersion, "a dated submitted copy is kept");

  // Before any match: only the applicant and coordinators can read it. Not even the opportunity's mentor.
  const doc = `/api/media/${upload.uploadId}`;
  assert.equal((await api(null, doc)).status, 404);
  assert.equal((await api(otherMentor, doc)).status, 404);
  assert.equal((await api(mentor, doc)).status, 404);
  assert.equal((await api(student, doc)).status, 200);
  assert.equal((await api(coordinator, doc)).status, 200);
  assert.equal(await getApplicationForViewer(applicationId, mentor.viewer), null);

  assert.equal((await proposeMatch(student.viewer, applicationId, opportunityId, "")).ok, false, "members can't propose matches");
  const proposed = await proposeMatch(coordinator.viewer, applicationId, opportunityId, "Good fit");
  const matchId = idOf(proposed);

  // Now the matched mentor can read it; an unrelated mentor still can't, by page or by file.
  assert.equal((await api(mentor, doc)).status, 200);
  assert.equal((await api(otherMentor, doc)).status, 404);
  assert.equal(await getMatchForViewer(matchId, otherMentor.viewer), null);
  assert.equal((await api(otherMentor, `/account/matches/${matchId}`)).status, 404);
  assert.equal((await respondToMatch(otherMentor.viewer, matchId, true)).ok, false);

  // One acceptance alone does not start the placement.
  const first = await respondToMatch(student.viewer, matchId, true);
  assert.ok(first.ok && first.activated === false);
  assert.equal((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status, "PROPOSED");
  assert.equal((await updateBrief(student.viewer, matchId, { brief: "x", supervisor: "", resources: "", meetingCadence: "", expectedOutput: "" })).ok, false);
  const second = await respondToMatch(mentor.viewer, matchId, true);
  assert.ok(second.ok && second.activated === true);
  const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
  assert.equal(opp.filled, 1);
  assert.equal(opp.status, "CLOSED", "an opportunity with no places left closes");

  assert.ok((await updateBrief(mentor.viewer, matchId, { brief: "Agreed brief", supervisor: "Mentor", resources: "Lab", meetingCadence: "Fortnightly", expectedOutput: "Report" })).ok);
  assert.ok((await addMilestone(student.viewer, matchId, "First milestone", null)).ok);
  assert.equal((await addMilestone(otherMentor.viewer, matchId, "Intruder", null)).ok, false);
  assert.equal((await completeMatch(student.viewer, matchId, "Delivered a report", "")).ok, false, "only the mentor completes");
  assert.ok((await completeMatch(mentor.viewer, matchId, "Delivered a report and a dataset", "Well done")).ok);
  assert.equal((await prisma.mentorshipApplication.findUniqueOrThrow({ where: { id: applicationId } })).status, "COMPLETED");
  assert.equal((await api(null, doc)).status, 404, "documents stay private after completion");
});

test("a withdrawn application cannot be activated", async () => {
  const oppId = await opportunity(1);
  const saved = await saveApplication(student2.viewer, null, oppId, { ...application, documentUploadId: null }, true);
  const applicationId = idOf(saved);
  const matchId = idOf(await proposeMatch(coordinator.viewer, applicationId, oppId, ""));
  assert.ok((await respondToMatch(mentor.viewer, matchId, true)).ok);
  assert.ok((await withdrawApplication(student2.viewer, applicationId)).ok);
  assert.equal((await respondToMatch(student2.viewer, matchId, true)).ok, false);
  assert.equal((await prisma.opportunity.findUniqueOrThrow({ where: { id: oppId } })).filled, 0);
  assert.notEqual((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status, "ACTIVE");
});

test("capacity can't be exceeded by accepts that arrive at the same moment", async () => {
  const oppId = await opportunity(1);
  const students = await Promise.all([1, 2, 3, 4].map((n) => makeUser(`race${n}`)));
  const matchIds: string[] = [];
  for (const s of students) {
    const saved = await saveApplication(s.viewer, null, oppId, { ...application, documentUploadId: null }, true);
    const matchId = idOf(await proposeMatch(coordinator.viewer, idOf(saved), oppId, ""));
    matchIds.push(matchId);
    assert.ok((await respondToMatch(mentor.viewer, matchId, true)).ok);
  }
  // All four students accept at once; there is one place.
  const results = await Promise.all(students.map((s, i) => respondToMatch(s.viewer, matchIds[i], true)));
  assert.equal(results.filter((r) => r.ok && r.activated).length, 1);
  assert.equal(await prisma.match.count({ where: { id: { in: matchIds }, status: "ACTIVE" } }), 1);
  const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: oppId } });
  assert.equal(opp.filled, 1);
  assert.ok(opp.filled <= opp.capacity);
});
