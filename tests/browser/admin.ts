// Admin navigation and visual evidence. Uses only the local harness and fictional people.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp } from "./harness";
async function main() {
  const env=localEnv(), sql=db(env), mail=await mailbox(), app=await startApp(env,mail.url);
  const browser=await chromium.launch();
  try {
    await sql.connect();
    const room=await engagement(sql,["Ruth","Ben"]), fac=await facilitator(env,sql,room.id);
    await sql.query("update public.clearway_users set is_admin=true where email=$1",[fac.session.user.email]);
    await sql.query("update public.engagements set title='Staff planning workshop',type='team_workshop',start_date='2027-02-20',end_date='2027-02-20' where id=$1",[room.id]);
    const context=await browser.newContext(); await context.addCookies(fac.cookies(app.origin));
    const page=await context.newPage();
    const before=process.env.KIT_BEFORE==="1", area=process.env.KIT_AREA??"a";
    const paths:Record<string,string[]>={a:["/sign-in","/setup","/control",...(!before?["/setup/users"]:[])],b:["/setup/new",`/setup/${room.id}`],c:[`/setup/${room.id}/door`,`/setup/${room.id}/tv`,`/setup/${room.id}/discover`,`/setup/${room.id}/four-lists`,"/setup/templates"],d:["after","check-ins","recap","share","report","plan","map","review","latency"].map(p=>`/control/${room.id}/${p}`)};
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      for (const path of (area==="all"?Object.values(paths).flat():paths[area])) {
        const response=await page.goto(app.origin+path); await page.waitForLoadState("networkidle");
        assert.ok(response && response.status()<400,`${path} loads: ${response?.status()}`);
        if(!before) {
          assert.equal(await page.locator("#main").count(),1,`${path} has one main destination`);
          assert.ok(await page.locator("h1").count(),`${path} has a heading`);
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path} fits ${width}px`);
          if(path==="/control") assert.equal(new URL(page.url()).pathname,"/setup");
          if(path==="/setup") for(const label of ["Edit setup","Open run of show","Open the live room","Open door list","Open After the retreat"])
            assert.ok(await page.getByRole("link",{name:label,exact:true}).count(),label);
        }
        if(process.env.KIT_SHOTS) { await mkdir(process.env.KIT_SHOTS,{recursive:true}); await page.screenshot({path:`${process.env.KIT_SHOTS}/${path.replace(room.id,"engagement").replaceAll("/","-").slice(1)}-${width}.png`,fullPage:true}); }
      }
    }
    if(!before && area==="a") {
      await sql.query("update public.clearway_users set is_admin=false where email=$1",[fac.session.user.email]);
      const denied=await page.goto(app.origin+"/setup/users"); assert.equal(denied?.status(),404,"only admins reach user administration");
      await page.goto(app.origin+"/setup"); assert.equal(await page.getByRole("link",{name:"Manage Clearway users"}).count(),0);
      const outsider=await browser.newPage(); await outsider.goto(app.origin+"/setup"); assert.equal(new URL(outsider.url()).pathname,"/sign-in"); await outsider.close();
    }
    assert.equal(mail.count,0,"admin audit sends no email");
    console.log(`Admin ${area} kit passed at desktop and narrow widths${before?" (baseline)":""}.`);
  } finally {await browser.close(); app.stop(); await mail.close(); await sql.end();}
}
main().catch(e=>{console.error(e);process.exit(1);});
