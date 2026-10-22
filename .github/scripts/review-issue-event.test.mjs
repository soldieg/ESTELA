import assert from "node:assert/strict";
import { test } from "node:test";
import { planIssueEvent } from "./review-issue-event.mjs";

const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const issue = (category = "salon", photoId = null) => ({
  number: 17, title: "[AVALIAÇÃO] Salão", body: `<!-- estela-review:v1:${encoded({ version: 1, category, photoId })} -->`,
});

test("plans labels for a salon review", () => {
  assert.deepEqual(planIssueEvent({ action: "opened", issue: issue() }), {
    type: "label", issueNumber: 17, labels: ["estela-review", "review-salao"],
  });
});

test("plans labels for an atelier review", () => {
  assert.deepEqual(planIssueEvent({ action: "opened", issue: issue("atelier") }).labels, ["estela-review", "review-atelie"]);
});

test("ignores unrelated and malformed issue events", () => {
  assert.equal(planIssueEvent({ action: "opened", issue: { number: 2, title: "hello", body: "" } }), null);
  assert.equal(planIssueEvent({ action: "edited", issue: issue() }), null);
  assert.equal(planIssueEvent({ action: "opened", issue: { ...issue(), body: "<!-- estela-review:v1:bad -->" } }), null);
  assert.equal(planIssueEvent({ action: "opened", issue: issue("unknown") }), null);
});

test("plans cleanup only for a deleted review with a valid photo UUID", () => {
  const photoId = "8a87189e-44fc-45b6-bd34-c507194136cb";
  assert.deepEqual(planIssueEvent({ action: "deleted", issue: issue("salon", photoId) }), { type: "cleanup", photoId });
  assert.equal(planIssueEvent({ action: "deleted", issue: issue() }), null);
  assert.equal(planIssueEvent({ action: "deleted", issue: issue("salon", "not-a-uuid") }), null);
});
