import test from "node:test";
import assert from "node:assert/strict";
import { compareEngagements, type ListedEngagement } from "../../lib/setup/listing";
const row = (id: string, start: string | null, status = "setup"): ListedEngagement => ({id,title:id,type:"team_workshop",status,start_date:start,end_date:null,retreat_start_date:null,retreat_end_date:null,pre_call_at:null,team_hub_client_id:null,church:{name:"Riverside",timezone:"America/Toronto"}});
test("facilitator home orders upcoming, undated, past and closed engagements", () => {
  const entries=[row("past-old","2026-01-01"),row("later","2026-12-01"),row("closed","2026-11-10","closed"),row("undated",null),row("soon","2026-11-10"),row("past-new","2026-11-08")];
  assert.deepEqual(entries.sort((a,b)=>compareEngagements(a,b,new Date("2026-11-09T17:00:00Z"))).map(e=>e.id),["soon","later","undated","past-new","past-old","closed"]);
});
