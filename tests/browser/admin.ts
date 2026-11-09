// Admin navigation and visual evidence. Uses only the local harness and fictional people.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { db, engagement, facilitator, localEnv, mailbox, startApp } from "./harness";
async function main() {
  if(process.env.KIT_AREA==="b" && process.env.KIT_BEFORE!=="1") process.env.TEAM_HUB_DATABASE_URL="postgres://clearway_live_reader:local@127.0.0.1:1/postgres";
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
    if(!before && area==="b") {
      await page.goto(`${app.origin}/setup/${room.id}`);
      assert.equal(await page.getByLabel("Workshop date",{exact:true}).count(),1);
      assert.equal(await page.getByLabel("Lens 1",{exact:true}).count(),0);
      assert.equal(await page.getByLabel("Governance body’s name",{exact:true}).count(),0);
      assert.equal(await page.getByLabel("Scripture translation",{exact:true}).count(),0);
      assert.equal(await page.getByText("Add a Clearway user",{exact:true}).count(),0);
      assert.equal(await page.getByText("This appears in workshop invites. Explain how the team will reach decisions.").count(),1);
      await page.getByRole("combobox",{name:/^Engagement type/}).selectOption("wayfinding");
      assert.equal(await page.getByLabel("Lens 1",{exact:true}).count(),1);
      await page.getByRole("combobox",{name:/^Engagement type/}).selectOption("team_workshop");
      await page.getByRole("button",{name:"Save engagement",exact:true}).click();
      await page.getByRole("status").filter({hasText:"Saved."}).waitFor();
      await sql.query("update public.churches set team_hub_client_id=id where id=(select church_id from public.engagements where id=$1)",[room.id]);
      const ids=(await sql.query("update public.engagements set team_hub_client_id=church_id,team_hub_engagement_id=gen_random_uuid() where id=$1 returning team_hub_client_id,team_hub_engagement_id",[room.id])).rows[0];
      const payload={action:"create",hub_client:ids.team_hub_client_id,hub_engagement:ids.team_hub_engagement_id,church:{name:"Riverside",timezone:"America/Toronto"},engagement:{title:"Planning",type:"team_workshop",status:"setup",start_date:"2027-02-20",end_date:"",retreat_start_date:"",retreat_end_date:"",base_year:"",lens_names:[],how_the_room_decides:"The team agrees together.",settings:{}}};
      const duplicate=await context.request.post(app.origin+"/api/setup",{headers:{origin:app.origin},data:payload});
      assert.equal(duplicate.status(),409); assert.equal((await duplicate.json()).existing_id,room.id);
      await page.route("**/api/setup",async route=>{
        const data=route.request().postDataJSON();
        if(data.action==="hub_clients") return route.fulfill({json:{ok:true,clients:[{id:ids.team_hub_client_id,name:"Riverside Church"}]}});
        if(data.action==="hub_engagements") return route.fulfill({json:{ok:true,engagements:[{id:ids.team_hub_engagement_id,title:"Staff planning workshop",live_id:room.id}]}});
        return route.continue();
      });
      await page.goto(app.origin+"/setup/new"); await page.getByRole("button",{name:"Find churches",exact:true}).click();
      await page.getByRole("combobox",{name:/^Church/}).selectOption(ids.team_hub_client_id);
      const option=page.getByRole("option",{name:"Staff planning workshop · Already in Live",exact:true});
      await option.waitFor({state:"attached"}); assert.equal(await option.evaluate(node=>(node as HTMLOptionElement).disabled),true);
      assert.equal(await page.getByRole("link",{name:"Open Staff planning workshop",exact:true}).getAttribute("href"),`/setup/${room.id}`);
      await page.getByRole("combobox",{name:/^Engagement type/}).selectOption("team_workshop");
      if(process.env.KIT_SHOTS) await page.screenshot({path:`${process.env.KIT_SHOTS}/setup-new-linked-workshop-390.png`,fullPage:true});
      await page.unroute("**/api/setup");
      await sql.query("update public.clearway_users set is_admin=false where email=$1",[fac.session.user.email]);
      await page.goto(`${app.origin}/setup/${room.id}`); assert.equal(await page.getByRole("checkbox",{name:/^Open joining:/}).isDisabled(),true);
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
