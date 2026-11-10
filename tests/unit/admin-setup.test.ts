import test from "node:test";
import assert from "node:assert/strict";
import { setupInput, consensus } from "../../lib/setup/policy";
import { deliberate } from "../../lib/setup/errors";
const input = (type: string, lens_names: unknown) => ({church:{name:"Riverside",timezone:"America/Toronto"},engagement:{title:"Planning",type,status:"setup",start_date:"2027-02-20",end_date:"",retreat_start_date:"",retreat_end_date:"",base_year:"",lens_names,how_the_room_decides:consensus,settings:{}}});
test("a workshop saves without requiring Wayfinding lens names",()=>{
 const saved=setupInput(input("team_workshop",[])); assert.equal(saved.engagement.start_date,"2027-02-20"); assert.equal(saved.engagement.lens_names.length,5);
 assert.throws(()=>setupInput(input("wayfinding",[])),/Five Lenses/);
 assert.equal(setupInput(input("team_workshop",["People"])).engagement.lens_names[0],"People");
});
test("the unique Team Hub engagement conflict has a clear 409 response",()=>{
 assert.deepEqual(deliberate({code:"23505",message:'duplicate key value violates unique constraint "engagements_team_hub_unique"'}),{message:"This engagement is already in Live. Open it from your engagements.",status:409});
 assert.equal(deliberate({code:"23505",message:"another_private_index"}),null);
});

test("workshop dates ignore retained Wayfinding retreat dates",async()=>{
 const {eventDate}=await import("../../lib/setup/listing");
 assert.equal(eventDate({type:"team_workshop",start_date:"2027-02-20",end_date:null,retreat_start_date:"2026-01-01",retreat_end_date:"2026-01-02",pre_call_at:null}),"Sat, Feb 20, 2027");
});
