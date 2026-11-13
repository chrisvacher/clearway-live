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
    const afterArea=process.env.KIT_AREA==="d";
    await sql.query("update public.engagements set title=$2,type=$3::public.engagement_type,start_date='2027-02-20',end_date='2027-02-20' where id=$1",[room.id,afterArea?"Riverside Wayfinding retreat":"Staff planning workshop",afterArea?"wayfinding":"team_workshop"]);
    if(process.env.KIT_AREA==="c") await sql.query("insert into public.attendees(engagement_id,name,email) values($1,'Workshop guest',$2)",[room.id,`guest-${room.id}@guest.clearway.invalid`]);
    const context=await browser.newContext(); await context.addCookies(fac.cookies(app.origin));
    const page=await context.newPage();
    const before=process.env.KIT_BEFORE==="1", area=process.env.KIT_AREA??"a";
    const paths:Record<string,string[]>={a:["/sign-in","/setup","/control",...(!before?["/setup/users","/setup/operations"]:[])],b:["/setup/new",`/setup/${room.id}`,`/setup/${room.id}/details`,`/setup/${room.id}/joining`],c:[`/setup/${room.id}/door`,`/setup/${room.id}/tv`,`/setup/${room.id}/discover`,`/setup/${room.id}/four-lists`,"/setup/templates"],d:["after","check-ins","recap","share","report","plan","map","review","latency"].map(p=>`/control/${room.id}/${p}`)};
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      for (const path of (area==="all"?Object.values(paths).flat():paths[area])) {
        const response=await page.goto(app.origin+path); await page.waitForLoadState("networkidle");
        assert.ok(response && response.status()<400,`${path} loads: ${response?.status()}`);
        if(!before) {
          assert.equal(await page.locator("#main").count(),1,`${path} has one main destination`);
          assert.ok(await page.locator("h1").count(),`${path} has a heading`);
          const titleSize=await page.locator("h1").first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)); assert.ok(titleSize<=28,`${path} first h1 is page-title size or smaller (admin stylesheet loaded): ${titleSize}px`);
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path} fits ${width}px`);
          if((area==="c" || area==="d") && path!=="/setup/templates") {
            assert.equal(await page.getByRole("navigation",{name:"Engagement",exact:true}).count(),1);
            assert.ok(await page.locator(".shell-who").textContent().then(text=>(text ?? "").includes("Riverside Church")));
          }
          if(area==="c" && path.endsWith("/door")) {
            assert.equal(await page.getByText("Joined by name",{exact:true}).count(),1);
            assert.equal(await page.getByText("Joined by name · Not signed in",{exact:true}).count(),0);
          }
          if(area==="d" && width===390) {
            const sidebar=page.locator(".shell-nav");
            if(await sidebar.count()) assert.ok((await sidebar.boundingBox())!.height<220,`${path} navigation stays compact`);
          }
          if(path==="/control") assert.equal(new URL(page.url()).pathname,"/setup");
          if(path==="/setup") { assert.ok(await page.getByRole("link",{name:/^(Continue setup|Open overview|Open the live room|Open results)$/}).count(),"each engagement leads with one action");
            for(const label of ["Details","Run of show","Door list","Results"]) assert.ok(await page.locator(".admin-more-list a",{hasText:label}).count(),label); }
          if(path===`/setup/${room.id}`) { assert.equal(await page.getByRole("heading",{name:"Invite the room",exact:true}).count(),1); assert.equal(await page.getByRole("button",{name:"Copy link",exact:true}).count(),1); assert.equal(await page.getByRole("img",{name:/^QR code for live\.clearway\.co\//}).count(),1); }
        }
        if(process.env.KIT_SHOTS) { await mkdir(process.env.KIT_SHOTS,{recursive:true}); await page.screenshot({path:`${process.env.KIT_SHOTS}/${path.replace(room.id,"engagement").replaceAll("/","-").slice(1)}-${width}.png`,fullPage:true}); }
      }
    }
    if(!before && area==="d") {
      for(const [path,title] of [["recap","Results"],["share","Read-only copy"],["check-ins","Check-ins"],["after","After the retreat"],["latency","Phone to TV"],["map","Draft Clearway Map"]]) {
        await page.goto(`${app.origin}/control/${room.id}/${path}`);
        assert.equal(await page.getByRole("heading",{level:1}).count(),1,`${path} has one h1`);
        assert.equal(await page.getByRole("heading",{level:1,name:title,exact:true}).count(),1,`${path} is titled ${title}`);
        assert.equal(await page.locator("main .admin-heading .admin-kicker").count(),1,`${path} has a kicker in the standard frame`);
        assert.equal(await page.getByText("Only you see this",{exact:true}).count(),1,`${path} has only the shell's band`);
      }
      await page.goto(`${app.origin}/control/${room.id}/recap`);
      assert.equal(await page.getByRole("heading",{name:"Downloads",exact:true}).count(),1);
      assert.equal(await page.getByRole("link",{name:"Every answer as CSV",exact:true}).getAttribute("href"),`/api/control/${room.id}/export?session=all`);
      assert.equal(await page.getByRole("link",{name:"Download everything",exact:true}).getAttribute("href"),`/api/control/${room.id}/export?format=json`);
      await page.goto(`${app.origin}/control/${room.id}/after`);
      for(const id of ["after-results","after-report","after-visibility","after-share","after-checkins"]) assert.equal(await page.getByTestId(id).count(),1,id);
      assert.equal(await page.getByTestId("after-share").getByText("Read-only copy",{exact:true}).count(),1,"the Share tile is called Read-only copy");
    }
    if(!before && area==="b") {
      await page.goto(`${app.origin}/setup/${room.id}/details`);
      assert.equal(await page.getByLabel("Workshop date",{exact:true}).count(),1);
      assert.equal(await page.getByLabel("Lens 1",{exact:true}).count(),0);
      assert.equal(await page.getByLabel("Governance body’s name",{exact:true}).count(),0);
      assert.equal(await page.getByLabel("Scripture translation",{exact:true}).count(),0);
      assert.equal(await page.getByText("Add a Clearway user",{exact:true}).count(),0);
      assert.equal(await page.getByRole("checkbox",{name:/^Open joining:/}).count(),0,"joining lives on its own page");
      assert.equal(await page.getByLabel("TV theme",{exact:true}).count(),0,"the screen's settings live on Screens");
      await page.getByRole("combobox",{name:/^Kind of event/}).selectOption("wayfinding");
      assert.equal(await page.getByLabel("Lens 1",{exact:true}).count(),1);
      await page.getByRole("combobox",{name:/^Kind of event/}).selectOption("team_workshop");
      await page.getByRole("button",{name:"Save engagement",exact:true}).click();
      await page.getByRole("status").filter({hasText:"Saved."}).waitFor();
      // Logo upload: a small PNG shows a preview, saves, survives a reload and can be removed; a text file renamed .png is refused in plain words.
      const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==","base64");
      assert.equal(await page.getByText("No logo",{exact:true}).count(),1,"a church without a logo shows the empty box");
      await page.locator('input[type="file"]').setInputFiles({name:"logo.png",mimeType:"image/png",buffer:png});
      await page.getByRole("img",{name:"Church logo preview"}).waitFor();
      await page.getByRole("status").filter({hasText:"Logo ready. Save to keep it."}).waitFor();
      await page.getByRole("button",{name:"Save church",exact:true}).click(); await page.getByRole("status").filter({hasText:"Saved."}).waitFor();
      await page.reload(); await page.getByRole("img",{name:"Church logo preview"}).waitFor();
      assert.ok(await page.getByRole("img",{name:"Church logo preview"}).evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0),"the saved logo loads after a reload");
      await page.locator('input[type="file"]').setInputFiles({name:"logo.png",mimeType:"image/png",buffer:Buffer.from("this is only text")});
      await page.getByRole("status").filter({hasText:"Use a PNG, JPEG or WebP image."}).waitFor();
      await page.getByRole("button",{name:"Remove logo",exact:true}).click(); await page.getByRole("button",{name:"Save church",exact:true}).click(); await page.getByRole("status").filter({hasText:"Saved."}).waitFor();
      await page.reload(); await page.getByText("No logo",{exact:true}).waitFor();
      assert.equal(await page.getByRole("combobox",{name:/^Time zone/}).inputValue(),"America/Toronto","the time zone is a picker that holds the stored zone");
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
      await page.getByRole("button",{name:/^Riverside Church/}).click();
      await page.getByText("Already in Live.").waitFor();
      assert.equal(await page.getByRole("link",{name:"Open Staff planning workshop",exact:true}).getAttribute("href"),`/setup/${room.id}`);
      assert.equal(await page.getByRole("button",{name:"Create engagement",exact:true}).isDisabled(),true,"a linked engagement can’t be created twice");
      assert.equal(await page.getByLabel("Lens 1",{exact:true}).count(),0); assert.equal(await page.getByRole("radio",{name:/^Open workshop/}).isChecked(),true);
      if(process.env.KIT_SHOTS) await page.screenshot({path:`${process.env.KIT_SHOTS}/setup-new-linked-workshop-390.png`,fullPage:true});
      await page.unroute("**/api/setup");
      await sql.query("update public.clearway_users set is_admin=false where email=$1",[fac.session.user.email]);
      await page.goto(`${app.origin}/setup/${room.id}/joining`); assert.equal(await page.getByRole("radio",{name:/^Anyone who has the link or code/}).isDisabled(),true,"only an admin changes open joining");
      // The lead names the link, and the name opens the room for a phone with no sign-in.
      const linkName=`kit${room.id.replace(/-/g,"").slice(0,12)}`;
      await page.getByRole("radio",{name:/^A name you choose/}).check();
      await page.getByLabel("live.clearway.co/",{exact:true}).fill("ab"); assert.equal(await page.getByRole("button",{name:"Save the name",exact:true}).isDisabled(),true,"a name needs three characters");
      await page.getByLabel("live.clearway.co/",{exact:true}).fill("Set Up!"); assert.equal(await page.getByLabel("live.clearway.co/",{exact:true}).inputValue(),"setup","only letters and digits are kept");
      await page.getByRole("button",{name:"Save the name",exact:true}).click(); await page.getByText("That name is used by the app. Choose another.").waitFor();
      await page.getByLabel("live.clearway.co/",{exact:true}).fill(linkName); await page.getByRole("button",{name:"Save the name",exact:true}).click();
      await page.getByText("Saved. The new link works now.").waitFor();
      const visitor=await browser.newPage(); await visitor.goto(`${app.origin}/${linkName.toUpperCase()}`); assert.equal(new URL(visitor.url()).pathname,`/room/${room.id}`,"the chosen name opens the room, in any case");
      const lost=await visitor.goto(`${app.origin}/nosuchroomname`); assert.equal(lost?.status(),404,"a name nobody chose is a page that doesn't exist"); await visitor.close();
      await page.goto(`${app.origin}/setup/${room.id}`); assert.ok((await page.locator(".invite-card").innerText()).includes(`live.clearway.co/${linkName}`),"the Overview shows the chosen link");
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
