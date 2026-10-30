import assert from "node:assert/strict";
import { rootCertificates } from "node:tls";
import test from "node:test";
import { readerConfig } from "../../lib/team-hub/config";

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
