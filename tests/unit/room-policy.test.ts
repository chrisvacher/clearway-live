import assert from "node:assert/strict";
import test from "node:test";
import { digest,hash,newCode,newDevice,newLink,normalizedEmail,parseDevice,sessionId,uuid } from "../../lib/room/policy";

test("room email matching normalizes case and whitespace without accepting malformed addresses",()=>{
  assert.equal(normalizedEmail(" Ann@Example.org "),"ann@example.org");
  for(const value of [null,{},"a@b@c.org","a b@c.org","a@b", "a".repeat(250)+"@example.org"]) assert.equal(normalizedEmail(value),null);
});
test("device proofs use independent unpredictable identifiers and an unambiguous short code",()=>{
  const values=Array.from({length:100},newDevice);
  assert.equal(new Set(values.map(v=>v.id)).size,100);assert.equal(new Set(values.map(v=>v.secret)).size,100);
  for(const value of values){assert.ok(uuid(value.id));assert.match(value.secret,/^[a-f0-9]{64}$/);assert.match(value.code,/^[A-HJ-NP-Z2-9]{8}$/);assert.deepEqual(parseDevice(JSON.stringify(value)),{id:value.id,secret:value.secret});}
  for(const value of [undefined,"",'{}','{"id":"bad","secret":"abc"}'])assert.equal(parseDevice(value),null);
});
test("codes are six digits and only purpose-bound HMAC values are stored",()=>{
  for(let i=0;i<100;i++)assert.match(newCode(),/^\d{6}$/);
  assert.match(newLink(),/^[a-f0-9]{64}$/);assert.match(hash("secret"),/^[a-f0-9]{64}$/);
  assert.notEqual(digest("key","room-code","a","ann@example.org","123456"),digest("key","room-code","b","ann@example.org","123456"));
  assert.notEqual(digest("key","a","b"),digest("key","ab"));assert.notEqual(digest("key","a"),digest("other","a"));
});
test("only a trusted Auth response containing a valid session id can be bound",()=>{
  const id="60000000-0000-4000-8000-000000000001";
  assert.equal(sessionId("x."+Buffer.from(JSON.stringify({session_id:id})).toString("base64url")+".x"),id);
  for(const value of ["", "bad", "x.e30.x"])assert.equal(sessionId(value),null);
});
