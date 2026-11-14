// Admin navigation and visual evidence. Uses only the local harness and fictional people.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { setupInput } from "../../lib/setup/policy";
import { linkQr } from "../../lib/tv/qr";
import { db, engagement, facilitator, localEnv, mailbox, press, startApp } from "./harness";
async function main() {
  if(process.env.KIT_AREA==="b" && process.env.KIT_BEFORE!=="1") process.env.TEAM_HUB_DATABASE_URL="postgres://clearway_live_reader:local@127.0.0.1:1/postgres";
  const env=localEnv(), sql=db(env), mail=await mailbox(), app=await startApp(env,mail.url);
  const browser=await chromium.launch();
  try {
    await sql.connect();
    const clearwayHost=new URL(app.origin).host, noveteraHost=new URL(app.noveteraOrigin).host;
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
          if(area==="c" && path.endsWith("/discover") && page.url().endsWith(path)) { assert.equal(await page.getByText("Only you see this",{exact:true}).count(),1,"Discover draws no privacy marker of its own"); assert.equal(await page.getByText("Back to the engagement").count(),0); assert.ok((await page.locator("main .admin-kicker").textContent() ?? "").includes("Riverside Church")); }
          if(area==="c" && path.endsWith("/four-lists") && page.url().endsWith(path)) { assert.equal(await page.getByRole("link",{name:"Download CSV"}).count(),0,"no CSV without a Four Helpful Lists step"); assert.equal(await page.getByRole("button",{name:"Refresh lists",exact:true}).count(),1); assert.equal(await page.getByRole("navigation",{name:"Engagement",exact:true}).getByRole("link",{name:"Four Helpful Lists",exact:true}).count(),0,"the sidebar leaves out Four Helpful Lists without the step"); }
          if(area==="d" && width===390) {
            const sidebar=page.locator(".shell-nav");
            if(await sidebar.count()) assert.ok((await sidebar.boundingBox())!.height<220,`${path} navigation stays compact`);
          }
          if(path==="/control") assert.equal(new URL(page.url()).pathname,"/setup");
          if(path==="/setup") { assert.ok(await page.getByRole("link",{name:/^(Continue setup|Open overview|Open the live room|Open results)$/}).count(),"each engagement leads with one action");
            for(const label of ["Details","Run of show","Door list","Results"]) assert.ok(await page.locator(".admin-more-list a",{hasText:label}).count(),label); }
          if(path===`/setup/${room.id}`) { assert.equal(await page.getByRole("heading",{name:"Invite the room",exact:true}).count(),1); assert.equal(await page.getByRole("button",{name:"Copy link",exact:true}).count(),1); assert.equal(await page.getByRole("img",{name:`QR code for ${clearwayHost}/`}).count(),1); }
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
      // The four steps are four identical cards: the title sits inside the card at one size, and one button is primary.
      const steps=await page.locator(".create-flow .admin-panel:has(h2, legend)").evaluateAll(cards=>cards.map(card=>{ const title=card.querySelector("h2, legend")!, box=card.getBoundingClientRect(), at=title.getBoundingClientRect(), style=getComputedStyle(card); return {inside:at.top>=box.top+parseFloat(style.paddingTop)-1&&at.left>=box.left+parseFloat(style.paddingLeft)-1,size:getComputedStyle(title).fontSize,border:style.borderTopWidth,radius:style.borderTopLeftRadius,pad:style.paddingTop}; }));
      assert.equal(steps.length,4,"four step cards"); assert.ok(steps.every(x=>x.inside),"each title is inside its card"); for(const key of ["size","border","radius","pad"] as const) assert.equal(new Set(steps.map(x=>x[key])).size,1,`the four cards share one ${key}`);
      assert.equal(await page.locator(".create-flow .admin-button.is-primary").count(),1,"one primary button on the page"); assert.equal(await page.getByRole("group",{name:/^2\. What kind of event/}).count(),1,"step 2 keeps its group name");
      if(process.env.KIT_SHOTS) await page.screenshot({path:`${process.env.KIT_SHOTS}/setup-new-linked-workshop-390.png`,fullPage:true});
      await page.unroute("**/api/setup");
      // Brand on create: Clearway is selected to start, the choice is the same field as on Details, and a new engagement can start as Novetera.
      const newHub={client:randomUUID(),engagement:randomUUID()}; const sent:{body?:{engagement:{skin?:string}}}={};
      await page.route("**/api/setup",async route=>{
        const data=route.request().postDataJSON();
        if(data.action==="hub_clients") return route.fulfill({json:{ok:true,clients:[{id:newHub.client,name:"Lakeside Church",timezone:"America/Toronto"}]}});
        if(data.action==="hub_engagements") return route.fulfill({json:{ok:true,client:{id:newHub.client,name:"Lakeside Church",timezone:"America/Toronto"},engagements:[{id:newHub.engagement,title:"AI workshop",engagement_type:"team_workshop",start_date:"2027-03-09"}]}});
        if(data.action!=="create") return route.continue();
        // The local stack has no Team Hub, so the page's create is carried out the way the route does it: the same checks, then the same database function.
        sent.body=data; const input=setupInput(data);
        const saved=await fac.client.rpc("save_engagement",{p_id:null,p_church:input.church,p_engagement:input.engagement,p_lead:data.lead,p_co:null,p_client:data.hub_client,p_hub_engagement:data.hub_engagement});
        assert.equal(saved.error,null,JSON.stringify(saved.error)); return route.fulfill({json:{ok:true,id:saved.data}});
      });
      await page.goto(app.origin+"/setup/new"); await page.getByRole("button",{name:"Find churches",exact:true}).click();
      await page.getByRole("button",{name:/^Lakeside Church/}).click(); await page.getByRole("button",{name:/^AI workshop/}).click();
      const createBrand=page.getByRole("combobox",{name:/^Brand/});
      assert.equal(await createBrand.inputValue(),"clearway","Clearway is selected to start"); assert.deepEqual(await createBrand.locator("option").allInnerTexts(),["Clearway","Novetera"]);
      assert.equal(await createBrand.isEnabled(),true,"an admin can choose the brand");
      assert.equal(await page.getByText("Sets what the room sees: the screens, phones, emails and summary, and the room’s address.",{exact:true}).count(),1,"the help line is Details’ help line");
      await createBrand.selectOption("novetera"); await page.getByRole("button",{name:"Create engagement",exact:true}).click();
      await page.waitForURL(/\/setup\/[0-9a-f-]{36}$/); assert.equal(sent.body?.engagement.skin,"novetera","the create carries the brand");
      assert.equal((await sql.query("select skin from public.engagements where team_hub_engagement_id=$1",[newHub.engagement])).rows[0].skin,"novetera","the new engagement is stored as Novetera");
      const newInvite=page.locator(".invite-facts"); await newInvite.waitFor();
      assert.ok((await newInvite.innerText()).includes(noveteraHost),`the Overview's invite card shows the Novetera address (${noveteraHost})`); assert.equal((await newInvite.innerText()).includes(clearwayHost),false,"and not the Clearway one");
      await page.unroute("**/api/setup");
      // Clearway users: the team fills the picker when the page opens, with no button pressed, and a failure offers Try again.
      let teamFails=true; const member={id:"7e1a0000-0000-4000-8000-000000000001",name:"Mara Quinn",email:"mara.quinn@clearway.co"};
      await page.route("**/api/setup",async route=>{ const data=route.request().postDataJSON(); if(data.action!=="hub_members") return route.continue(); return teamFails?route.fulfill({status:503,json:{ok:false,message:"The Team Hub connection is unavailable. Please try again later."}}):route.fulfill({json:{ok:true,members:[member]}}); });
      await page.goto(app.origin+"/setup/users"); await page.getByRole("button",{name:"Try again",exact:true}).waitFor();
      assert.equal(await page.getByRole("alert").filter({hasText:"The Team Hub connection is unavailable."}).count(),1,"a failed load says so"); assert.equal(await page.getByRole("combobox",{name:/^Team member/}).isDisabled(),true);
      teamFails=false; await page.getByRole("button",{name:"Try again",exact:true}).click();
      await page.getByRole("combobox",{name:/^Team member/}).locator("option",{hasText:"Mara Quinn"}).waitFor({state:"attached"});
      assert.equal(await page.getByRole("button",{name:"Load Clearway team"}).count(),0,"no button loads the team"); assert.equal(await page.getByRole("button",{name:"Try again",exact:true}).count(),0);
      assert.equal(await page.getByRole("button",{name:"Add Clearway user",exact:true}).isDisabled(),true,"adding waits for a member");
      await page.getByRole("combobox",{name:/^Team member/}).selectOption(member.id); assert.equal(await page.getByRole("button",{name:"Add Clearway user",exact:true}).isEnabled(),true);
      await page.goto(app.origin+"/setup/users"); await page.getByRole("combobox",{name:/^Team member/}).locator("option",{hasText:"Mara Quinn"}).waitFor({state:"attached"}); assert.equal(await page.getByRole("combobox",{name:/^Team member/}).isEnabled(),true,"the picker fills on open, with nothing pressed");
      await page.unroute("**/api/setup");
      await sql.query("update public.clearway_users set is_admin=false where email=$1",[fac.session.user.email]);
      await page.goto(`${app.origin}/setup/${room.id}/joining`); assert.equal(await page.getByRole("radio",{name:/^Anyone who has the link or code/}).isDisabled(),true,"only an admin changes open joining");
      // The lead names the link, and the name opens the room for a phone with no sign-in.
      const linkName=`kit${room.id.replace(/-/g,"").slice(0,12)}`;
      await page.getByRole("radio",{name:/^A name you choose/}).check();
      await page.getByLabel(`${clearwayHost}/`,{exact:true}).fill("ab"); assert.equal(await page.getByRole("button",{name:"Save the name",exact:true}).isDisabled(),true,"a name needs three characters");
      await page.getByLabel(`${clearwayHost}/`,{exact:true}).fill("Set Up!"); assert.equal(await page.getByLabel(`${clearwayHost}/`,{exact:true}).inputValue(),"setup","only letters and digits are kept");
      await page.getByRole("button",{name:"Save the name",exact:true}).click(); await page.getByText("That name is used by the app. Choose another.").waitFor();
      await page.getByLabel(`${clearwayHost}/`,{exact:true}).fill(linkName); await page.getByRole("button",{name:"Save the name",exact:true}).click();
      await page.getByText("Saved. The new link works now.").waitFor();
      const visitor=await browser.newPage(); await visitor.goto(`${app.origin}/${linkName.toUpperCase()}`); assert.equal(new URL(visitor.url()).pathname,`/room/${room.id}`,"the chosen name opens the room, in any case");
      const lost=await visitor.goto(`${app.origin}/nosuchroomname`); assert.equal(lost?.status(),404,"a name nobody chose is a page that doesn't exist"); await visitor.close();
      await page.goto(`${app.origin}/setup/${room.id}`); assert.ok((await page.locator(".invite-card").innerText()).includes(`${clearwayHost}/${linkName}`),"the Overview shows the chosen link");
      // The skin: an admin switches the engagement to Novetera on Details, the room link on the Overview moves to Novetera's address, and switching back restores it.
      await sql.query("update public.clearway_users set is_admin=true where email=$1",[fac.session.user.email]);
      await page.goto(`${app.origin}/setup/${room.id}/details`);
      assert.equal(await page.getByRole("combobox",{name:/^Brand/}).inputValue(),"clearway","a new engagement is a Clearway engagement");
      assert.equal(await page.getByText("Sets what the room sees: the screens, phones, emails and summary, and the room’s address.",{exact:true}).count(),1,"the picker says what it changes");
      assert.deepEqual(await page.getByRole("combobox",{name:/^Brand/}).locator("option").allInnerTexts(),["Clearway","Novetera"]);
      await page.getByRole("combobox",{name:/^Brand/}).selectOption("novetera"); await page.getByRole("button",{name:"Save engagement",exact:true}).click();
      await page.getByText(`Saved. The room link is now ${noveteraHost}/${linkName}.`,{exact:true}).waitFor();
      assert.equal((await sql.query("select skin from public.engagements where id=$1",[room.id])).rows[0].skin,"novetera","the skin is stored");
      await page.goto(`${app.origin}/setup/${room.id}`); const invite=await page.locator(".invite-card").innerText();
      assert.ok(invite.includes(`${noveteraHost}/${linkName}`)&&invite.includes(`typed at ${noveteraHost}`),"the Overview invite card shows Novetera's address"); assert.ok(!invite.includes(`${clearwayHost}/`),"and no longer Clearway's");
      assert.equal(await page.locator(".invite-card a.text-link").getAttribute("href"),`${app.noveteraOrigin}/${linkName}`,"the link opens at Novetera's address");
      await page.goto(`${app.origin}/setup/${room.id}/details`); await page.getByRole("combobox",{name:/^Brand/}).selectOption("clearway"); await page.getByRole("button",{name:"Save engagement",exact:true}).click();
      await page.getByText(`Saved. The room link is now ${clearwayHost}/${linkName}.`,{exact:true}).waitFor();
      await page.goto(`${app.origin}/setup/${room.id}`); assert.ok((await page.locator(".invite-card").innerText()).includes(`${clearwayHost}/${linkName}`),"switching back restores Clearway's address");
      await sql.query("update public.clearway_users set is_admin=false where email=$1",[fac.session.user.email]);
      await page.goto(`${app.origin}/setup/${room.id}/details`); assert.equal(await page.getByRole("combobox",{name:/^Brand/}).isDisabled(),true,"only an admin changes the brand");
    }
    if(!before && area==="a") {
      // Without a Team Hub connection the card says so in one line and draws no controls that can't work.
      await page.goto(app.origin+"/setup/users"); await page.getByText("The Team Hub connection is unavailable. Please try again later.",{exact:true}).waitFor();
      for(const name of ["Load Clearway team","Add Clearway user","Try again"]) assert.equal(await page.getByRole("button",{name}).count(),0,`no ${name} button without Team Hub`); assert.equal(await page.getByRole("combobox",{name:/^Team member/}).count(),0);
      await page.route("**/api/operations",route=>route.request().method()==="GET"?route.fulfill({json:{status:"ok",eligible_files:0,protected_files:0,protected_bytes:0,pending:0,last_run:null,last_recovery_check:null,last_alert:null,errors:[],backups:[]}}):route.continue());
      await page.goto(app.origin+"/setup/operations"); await page.getByText("No protected copies yet.",{exact:true}).waitFor(); assert.equal(await page.getByRole("heading",{name:"Recent protected copies"}).count(),1); await page.unroute("**/api/operations");
      await sql.query("update public.clearway_users set is_admin=false where email=$1",[fac.session.user.email]);
      const denied=await page.goto(app.origin+"/setup/users"); assert.equal(denied?.status(),404,"only admins reach user administration");
      await page.goto(app.origin+"/setup"); assert.equal(await page.getByRole("link",{name:"Manage Clearway users"}).count(),0);
      const outsider=await browser.newPage(); await outsider.goto(app.origin+"/setup"); assert.equal(new URL(outsider.url()).pathname,"/sign-in"); await outsider.close();
    }
    if(!before && (area==="c" || area==="all")) {
      // Open joining: the Door list shows who joined by name, never says to add people in setup, has no Refresh button and keeps up on its own.
      await sql.query("update public.engagements set type='team_workshop',settings=coalesce(settings,'{}'::jsonb)||'{\"open_join\":true}'::jsonb where id=$1",[room.id]);
      await sql.query("delete from public.attendees where engagement_id=$1 and email like '%@guest.clearway.invalid'",[room.id]);
      await sql.query("insert into public.attendees(engagement_id,name,email) values($1,'Kit Dana',$2)",[room.id,`guest-dana-${room.id}@guest.clearway.invalid`]);
      await page.setViewportSize({width:1440,height:1000}); await page.goto(`${app.origin}/setup/${room.id}/door`); await page.waitForLoadState("networkidle");
      assert.equal(await page.getByRole("heading",{name:"Door list",exact:true,level:1}).count(),1,"the title is the sidebar noun");
      assert.equal(await page.getByRole("heading",{name:"In the room",exact:true}).count(),1,"open joining says who is in the room");
      assert.equal(await page.getByText("Kit Dana",{exact:true}).count(),1,"a person who joined by name is listed by name");
      assert.equal(await page.getByText("Joined by name",{exact:true}).count(),1);
      assert.equal(await page.getByText(/guest\.clearway\.invalid/).count(),0,"the guest address is never shown");
      assert.equal(await page.getByText(/in setup/).count(),0,"the door list never sends people to setup");
      assert.equal(await page.getByRole("button",{name:/Refresh/}).count(),0,"the door list needs no Refresh button");
      await page.getByLabel("Device code on their phone").fill("ABCD2345");
      await sql.query("insert into public.attendees(engagement_id,name,email) values($1,'Kit Lee',$2)",[room.id,`guest-lee-${room.id}@guest.clearway.invalid`]);
      await page.getByText("Kit Lee",{exact:true}).waitFor({timeout:10000});
      assert.equal(await page.getByLabel("Device code on their phone").inputValue(),"ABCD2345","what was typed survives the refresh");
      await sql.query("delete from public.attendees where engagement_id=$1",[room.id]);
      await page.getByText("No one has joined yet. People appear here as they join.").waitFor({timeout:10000});
      await page.getByText("This is for people on a list.").waitFor({timeout:10000}); assert.equal(await page.getByLabel("Device code on their phone").count(),0,"nobody is on a list, so hand sign-in is one line");
    }
    if(!before && area==="c") {
      // One laptop: the live room's way back, its address and brand, its order on half a screen, the remote's panel and ending a workshop.
      const linkName=`kit${room.id.replace(/-/g,"").slice(0,12)}`, code=(await sql.query("select room_code from public.engagements where id=$1",[room.id])).rows[0].room_code as string;
      await sql.query("update public.engagements set link_name=$2,status='setup',type='team_workshop',skin='clearway',settings=coalesce(settings,'{}'::jsonb)||'{\"ai_enabled\":false}'::jsonb where id=$1",[room.id,linkName]);
      await sql.query("delete from public.attendees where engagement_id=$1",[room.id]);
      await room.session("Welcome","content","Welcome",1); const wall=await room.session("What worries you","wall","What worries you about AI?",2);
      const control=`${app.origin}/control/${room.id}`, status=async()=>(await sql.query("select status from public.engagements where id=$1",[room.id])).rows[0].status as string;
      await context.grantPermissions(["clipboard-read","clipboard-write"],{origin:app.origin});
      await page.setViewportSize({width:1512,height:982}); await page.goto(control); await page.waitForLoadState("networkidle");
      // 1. A way out of the live room.
      const back=page.getByRole("link",{name:"Back to the engagement",exact:true}); assert.equal(await back.getAttribute("href"),`/setup/${room.id}`,"the live room links back to the Overview");
      // 2. At 1512 the three columns are unchanged and nothing is folded.
      assert.equal(await page.locator(".ctl-cols").evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length),3,"three columns at 1512");
      assert.equal(await page.locator(".ctl-run-toggle").isVisible(),false,"no fold button at 1512"); assert.equal(await page.locator(".ctl-run-list").first().isVisible(),true,"the run of show shows at 1512");
      const colX=async(sel:string)=>(await page.locator(sel).first().boundingBox())!.x;
      assert.ok(await colX(".ctl-run")<await colX(".ctl-centre")&&await colX(".ctl-centre")<await colX(".ctl-side"),"run of show, controls and private panels run left to right");
      // 3. The room's identity, on the engagement's own address.
      const identity=page.getByTestId("room-identity");
      let line=await identity.innerText(); assert.ok(line.includes(`${clearwayHost}/${linkName}`)&&line.includes(`Room code ${code}`)&&line.includes("Clearway")&&/\d+ in the room/.test(line),`identity line: ${line}`);
      assert.equal(await identity.getByRole("link",{name:/in the room$/}).getAttribute("href"),"#ctl-door","the count goes to the door list on this page");
      await identity.getByRole("link",{name:/in the room$/}).click(); assert.equal(await page.locator("#ctl-door").isVisible(),true,"the door list is on the control surface");
      await sql.query("update public.engagements set skin='novetera' where id=$1",[room.id]); await page.goto(control); await page.waitForLoadState("networkidle");
      line=await page.getByTestId("room-identity").innerText(); assert.ok(line.includes(`${noveteraHost}/${linkName}`)&&line.includes("Novetera")&&!line.includes(clearwayHost),`a Novetera engagement shows its own address: ${line}`);
      assert.equal(await page.getByRole("heading",{name:"Live room",level:1}).count(),1,"the control surface stays Clearway Live");
      if(process.env.KIT_SHOTS) { await mkdir(process.env.KIT_SHOTS,{recursive:true}); await page.screenshot({path:`${process.env.KIT_SHOTS}/control-1512.png`}); }
      // Half a laptop screen: the live controls come first, the TV second, the run of show folded after.
      await page.setViewportSize({width:756,height:982}); await page.goto(control); await page.waitForLoadState("networkidle");
      const top=async(loc:import("playwright").Locator)=>(await loc.boundingBox())!.y;
      const go=page.getByRole("button",{name:/^Go live/}); assert.ok(await top(go)+(await go.boundingBox())!.height<=982,"Go live is inside the first screen at 756");
      assert.ok(await top(go)<await top(page.locator(".ctl-tv")),"the controls sit above the TV preview"); assert.ok(await top(page.locator(".ctl-tv"))<await top(page.locator(".ctl-run")),"the TV preview sits above the run of show");
      assert.equal(await page.locator(".ctl-run-list").first().isVisible(),false,"the run of show is folded");
      await page.getByRole("button",{name:"Show the run of show",exact:true}).click(); assert.equal(await page.locator(".ctl-run-list").first().isVisible(),true,"it opens on request");
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"the live room fits 756px");
      if(process.env.KIT_SHOTS) { await page.getByRole("button",{name:"Hide the run of show",exact:true}).click(); await page.evaluate(()=>scrollTo(0,0)); await page.screenshot({path:`${process.env.KIT_SHOTS}/control-756.png`}); await page.screenshot({path:`${process.env.KIT_SHOTS}/control-756-full.png`,fullPage:true}); }
      await page.setViewportSize({width:1512,height:982}); await page.goto(control); await page.waitForLoadState("networkidle");
      // The AI notice links to the AI card on Details.
      await press(fac,sql,room.id,"go_live",{session:wall}); await page.goto(control); await page.waitForLoadState("networkidle");
      assert.equal(await page.locator("[data-ai-panel]").getByRole("link",{name:"the engagement's setup",exact:true}).getAttribute("href"),`/setup/${room.id}/details#details-ai`);
      await press(fac,sql,room.id,"nothing_live");
      // The pages around it lead on.
      await page.goto(`${app.origin}/setup/${room.id}/door`); assert.equal(await page.getByRole("link",{name:"Go to the live room",exact:true}).getAttribute("href"),`/control/${room.id}`,"the Door list leads to the live room");
      await page.goto(`${app.origin}/setup/${room.id}/run-of-show`); assert.equal(await page.getByRole("link",{name:"Go to the live room",exact:true}).getAttribute("href"),`/control/${room.id}`,"the run of show leads to the live room");
      await page.goto(`${app.origin}/setup`); const row=page.locator(`.admin-row:has(a[href*="${room.id}"])`);
      assert.equal(await row.getByTestId("brand-label").innerText(),"Novetera","the list names the engagement's brand");
      if(process.env.KIT_SHOTS) { await page.screenshot({path:`${process.env.KIT_SHOTS}/list-1512.png`}); await page.setViewportSize({width:756,height:982}); await page.screenshot({path:`${process.env.KIT_SHOTS}/list-756.png`}); await page.setViewportSize({width:1512,height:982}); }
      await page.goto(`${app.origin}/setup/${room.id}/tv`); assert.equal(await page.locator("#tv-texture").count(),0,"a Novetera engagement has no texture setting");
      await sql.query("update public.engagements set skin='clearway' where id=$1",[room.id]);
      await page.goto(`${app.origin}/setup`); assert.equal(await page.locator(`.admin-row:has(a[href*="${room.id}"])`).getByTestId("brand-label").innerText(),"Clearway");
      await page.goto(`${app.origin}/setup/${room.id}/tv`); assert.equal(await page.locator("#tv-texture").count(),1,"a Clearway engagement keeps it");
      // 5. The remote: a panel with the link, a copy button and a code, and a way to open it here.
      await page.goto(control); await page.waitForLoadState("networkidle");
      await page.getByRole("button",{name:"Open the remote",exact:true}).click(); const panel=page.getByRole("dialog",{name:"Open the remote on a phone"});
      const remote=`${app.origin}/remote/${room.id}`; assert.equal((await panel.getByTestId("remote-link").innerText()).trim(),remote,"the panel shows the remote's link");
      assert.equal(await panel.getByTestId("remote-qr").locator("path").getAttribute("d"),linkQr(remote).path,"the code carries the same link");
      assert.ok(/Clearway Google account/.test(await panel.innerText())&&/lead or co-facilitator/.test(await panel.innerText()),"it says who can use it");
      await panel.getByRole("button",{name:"Copy link",exact:true}).click(); await panel.getByRole("button",{name:"Link copied",exact:true}).waitFor(); assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),remote,"the link is on the clipboard");
      assert.equal(await panel.getByRole("link",{name:"Open it on this computer",exact:true}).getAttribute("href"),`/remote/${room.id}`);
      if(process.env.KIT_SHOTS) await page.screenshot({path:`${process.env.KIT_SHOTS}/remote-panel-1512.png`});
      await page.keyboard.press("Escape"); assert.equal(await panel.count(),0,"Escape closes the panel");
      await page.goto(remote); await page.waitForLoadState("networkidle"); assert.equal(new URL(page.url()).pathname,`/remote/${room.id}`,"the remote still opens on this computer");
      // 4. End the workshop: asks first, says what happens, then sets the same closed status Details sets.
      await page.goto(control); await page.waitForLoadState("networkidle");
      await page.getByTestId("end-workshop").click(); const ask=page.getByRole("alertdialog",{name:"End the workshop?"});
      assert.ok(/Phones are signed out and answers close\. Results stay/.test(await ask.innerText()),"the confirm says what happens");
      if(process.env.KIT_SHOTS) await page.screenshot({path:`${process.env.KIT_SHOTS}/end-workshop-1512.png`});
      await ask.getByRole("button",{name:"Keep the workshop going",exact:true}).click(); assert.equal(await status(),"setup","keeping it going changes nothing");
      await page.getByTestId("end-workshop").click(); await page.getByTestId("end-workshop-confirm").click();
      await page.getByTestId("workshop-ended").waitFor(); assert.equal(await status(),"closed","the same closed status Details sets");
      await sql.query("update public.engagements set status='setup' where id=$1",[room.id]);
      await page.goto(`${app.origin}/control/${room.id}/recap`); await page.waitForLoadState("networkidle");
      assert.equal(await page.getByRole("link",{name:"Back to the engagement",exact:true}).last().getAttribute("href"),`/setup/${room.id}`,"Results leads back to the engagement");
      assert.equal(await page.locator("main").getByRole("link",{name:"All engagements",exact:true}).getAttribute("href"),"/setup");
      if(process.env.KIT_SHOTS) { await page.screenshot({path:`${process.env.KIT_SHOTS}/results-1512.png`,fullPage:true}); await page.setViewportSize({width:756,height:982}); await page.screenshot({path:`${process.env.KIT_SHOTS}/results-756.png`,fullPage:true}); await page.setViewportSize({width:1512,height:982}); }
      await page.locator(".recap-end").getByTestId("end-workshop").click(); await page.getByTestId("end-workshop-confirm").click(); await page.getByTestId("workshop-ended").waitFor();
      assert.equal(await status(),"closed","Results ends the workshop too");
      await sql.query("update public.engagements set status='setup',type='wayfinding' where id=$1",[room.id]);
      await page.goto(control); await page.waitForLoadState("networkidle"); assert.equal(await page.getByTestId("end-workshop").count(),0,"Wayfinding has no End the workshop");
      await page.goto(`${app.origin}/control/${room.id}/recap`); assert.equal(await page.getByTestId("end-workshop").count(),0,"nor on its Results");
    }
    assert.equal(mail.count,0,"admin audit sends no email");
    console.log(`Admin ${area} kit passed at desktop and narrow widths${before?" (baseline)":""}.`);
  } finally {await browser.close(); app.stop(); await mail.close(); await sql.end();}
}
main().catch(e=>{console.error(e);process.exit(1);});
