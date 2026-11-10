// Disposable local stack only. Prove that a reset never queues behind an
// ongoing room operation and cannot mutate data while that operation owns it.
import assert from "node:assert/strict";
import { db, localEnv } from "../browser/harness";

async function main() {
  const env = localEnv(), roomOperation = db(env), cron = db(env);
  try {
    await roomOperation.connect(); await cron.connect();
    const before = await cron.query("select count(*) from private.practice_reset_runs");
    await roomOperation.query("begin");
    await roomOperation.query("select pg_advisory_xact_lock(hashtextextended('90000000-0000-4000-8000-000000000010',7))");
    await cron.query("set role service_role");
    await cron.query("set statement_timeout='2s'");
    const result = await cron.query("select public.nightly_practice_reset() as result");
    assert.equal(result.rows[0].result.status, "busy");
    await cron.query("reset role");
    const after = await cron.query("select count(*) from private.practice_reset_runs");
    assert.equal(after.rows[0].count, before.rows[0].count);
    console.log("Practice reset skips a concurrent room operation without mutating its ledger.");
  } finally {
    await roomOperation.query("rollback").catch(() => {});
    await Promise.allSettled([roomOperation.end(), cron.end()]);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
