import assert from "node:assert/strict";
import { rootCertificates } from "node:tls";
import test from "node:test";
import { readerConfig } from "../../lib/team-hub/config";
import { teamHubDiagnostic } from "../../lib/team-hub/diagnostics";

test("Team Hub diagnostics identify connection failures without logging sensitive details",()=>{
  const secret="postgresql://reader:private-password@private-host/postgres";
  for(const [code,category] of [["SELF_SIGNED_CERT_IN_CHAIN","tls_certificate"],["28P01","authentication"],["42501","permission"],["42P01","schema"],["ENOTFOUND","network"],["ETIMEDOUT","timeout"]]){
    const result=teamHubDiagnostic(Object.assign(new Error(secret),{code,detail:secret,connectionString:secret}));
    assert.deepEqual(result,{category,code});assert.ok(!JSON.stringify(result).includes(secret));
  }
  for(const error of [null,secret,{code:secret,message:secret},{code:"toString"},{code:"__proto__"}]){
    assert.deepEqual(teamHubDiagnostic(error),{category:"unknown",code:"unknown"});
  }
});

test("Team Hub accepts only its dedicated reader on the expected project",()=>{
  const direct=readerConfig("postgresql://clearway_live_reader:password@db.tilmrkgiwlpuflbtueen.supabase.co:5432/postgres?sslmode=disable");
  assert.deepEqual(direct.ssl,{rejectUnauthorized:true});assert.equal(direct.user,"clearway_live_reader");assert.equal(direct.max,2);
  const pooled=readerConfig("postgresql://clearway_live_reader.tilmrkgiwlpuflbtueen:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres");assert.deepEqual(pooled.ssl,{rejectUnauthorized:true});
  assert.equal(readerConfig("postgresql://clearway_live_reader:password@127.0.0.1:54322/test").ssl,false);
  for(const url of ["postgresql://postgres:password@db.tilmrkgiwlpuflbtueen.supabase.co/postgres","postgresql://clearway_live_reader:password@db.hecdzipeokpioisdcegr.supabase.co/postgres","postgresql://clearway_live_reader.other:password@aws-0-us-east-1.pooler.supabase.com/postgres","postgresql://clearway_live_reader:password@evil.example/postgres","https://clearway_live_reader:password@db.tilmrkgiwlpuflbtueen.supabase.co/postgres"])assert.throws(()=>readerConfig(url));
});

test("Team Hub can trust its supplied database root certificate without weakening TLS",()=>{
 const dsn="postgresql://clearway_live_reader:password@db.tilmrkgiwlpuflbtueen.supabase.co/postgres?sslmode=disable";
 assert.deepEqual(readerConfig(dsn,rootCertificates[0]).ssl,{rejectUnauthorized:true,ca:rootCertificates[0]});
 assert.throws(()=>readerConfig(dsn,"not a certificate"));assert.throws(()=>readerConfig(dsn,rootCertificates[0]+"PRIVATE KEY"));
});
