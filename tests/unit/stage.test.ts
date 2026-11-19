import assert from "node:assert/strict";
import test from "node:test";
import { stageFor, stagesFor } from "../../lib/setup/stage";

test("workshop readiness, live room state and closure derive the four workshop stages", () => {
  const workshop = { type: "team_workshop", status: "setup" };
  const complete = [{ state: "ready" }, { state: "optional" }] as const;
  assert.equal(stageFor(workshop, [{ state: "todo" }]), "setup");
  assert.equal(stageFor(workshop, complete, { live_session_id: null }), "ready");
  assert.equal(stageFor(workshop, [{ state: "todo" }], { live_session_id: "session" }), "live");
  assert.equal(stageFor({ ...workshop, status: "closed" }, complete, { live_session_id: "session" }), "done");
  assert.deepEqual(stagesFor(workshop.type), [
    { stage: "done", label: "Mark as done", status: "closed" },
    { stage: "setup", label: "Reopen", status: "setup" },
  ]);
});

test("Wayfinding types and practice keep their existing statuses and labels", () => {
  for (const type of ["wayfinding", "day_and_a_half", "practice"]) {
    const choices = stagesFor(type);
    assert.deepEqual(choices.map(choice => choice.label), ["Setup", "Discover", "Pre-call", "Retreat", "Follow-up", "Closed"]);
    for (const { status, stage } of choices) {
      assert.equal(stageFor({ type, status }, [{ state: "todo" }], { live_session_id: "session" }), stage);
    }
  }
});
