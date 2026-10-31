import assert from "node:assert/strict";
import { test } from "node:test";
import { pairingCode, receiptInput, shortRoomLink } from "../../lib/tv/policy";
import { roomQr } from "../../lib/tv/qr";
import { TvReceipts, type Ack } from "../../lib/tv/receipts";
const engagement="55000000-0000-4000-8000-000000000001",id="55000000-0000-4000-8000-000000000002";
test("TV codes preserve leading zeros and room aliases cannot become open redirects",()=>{
 assert.equal(pairingCode("001 234"),"001234");for(const code of ["12345","1234567","abcdef",123456])assert.equal(pairingCode(code),null);
 assert.equal(shortRoomLink("a1b2c3d4"),"https://live.clearway.co/r/A1B2C3D4");for(const code of ["https://evil.example","../abc","123","ZZZZZZZZ"])assert.throws(()=>shortRoomLink(code));
 const qr=roomQr("A1B2C3D4");assert.ok(qr.size>=29);assert.ok(qr.path.startsWith("M4 4"));assert.ok(qr.path.length>3000);assert.deepEqual(roomQr("A1B2C3D4"),qr);
});
test("TV receipts validate every timestamp and keep each answer's original receive time",()=>{
 const now=new Date().toISOString();const body={engagement,version:4,received_at:now,uncertainty_ms:5,answers:[{id,revision:0,received_at:now,uncertainty_ms:2}]};
 assert.ok(receiptInput(body));for(const change of [{version:Infinity},{version:-1},{engagement:"other"},{received_at:"bad"},{uncertainty_ms:NaN},{answers:[{...body.answers[0],revision:-1}]},{answers:Array(501).fill(body.answers[0])}])assert.equal(receiptInput({...body,...change}),null);
});
test("TV acknowledgements wait for a painted version and never run concurrently",async()=>{
 const at="2026-10-30T20:00:00.000Z",sent:Ack[]=[];let release!:()=>void;
 const queue=new TvReceipts(engagement,async ack=>{sent.push(ack);if(sent.length===1)await new Promise<void>(r=>{release=r;});return true;},()=>({time:at,uncertainty:4}));
 queue.record(2,{id,revision:0,received_at:at,uncertainty_ms:2});assert.equal(sent.length,0);queue.paint(1);assert.equal(sent.length,1);assert.equal(sent[0].answers.length,0);
 queue.paint(2);assert.equal(sent.length,1);release();await new Promise(r=>setImmediate(r));assert.equal(sent.length,2);assert.equal(sent[1].version,2);assert.equal(sent[1].answers[0].received_at,at);queue.stop();queue.paint(3);assert.equal(sent.length,2);
});
