// Admin navigation and visual evidence. Uses only the local harness and fictional people.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { setupInput } from "../../lib/setup/policy";
import { linkQr } from "../../lib/tv/qr";
import { db, engagement, facilitator, localEnv, mailbox, press, startApp } from "./harness";
async function main() {
  const operationsAddress = "operations@clearway.test";
  process.env.OPERATIONS_ALERT_EMAIL = operationsAddress;
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
    const pageErrors: { path: string; message: string }[] = [];
    page.on("pageerror", error => pageErrors.push({ path: new URL(page.url()).pathname, message: error.message }));
    const before=process.env.KIT_BEFORE==="1", area=process.env.KIT_AREA??"a";
    const paths:Record<string,string[]>={a:["/sign-in","/admin","/control",...(!before?["/admin/users","/admin/operations"]:[])],b:["/admin/new",`/admin/${room.id}`,`/admin/${room.id}/details`,`/admin/${room.id}/joining`],c:[`/admin/${room.id}/door`,`/admin/${room.id}/tv`,`/admin/${room.id}/discover`,`/admin/${room.id}/four-lists`,"/admin/templates"],d:["after","check-ins","recap","share","report","plan","map","review","latency"].map(p=>`/control/${room.id}/${p}`)};
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
          if((area==="c" || area==="d") && path!=="/admin/templates") {
            assert.equal(await page.getByRole("navigation",{name:"Engagement",exact:true}).count(),1);
            const navigation = page.getByRole("navigation", {name:"Engagement", exact:true});
            if (width < 900) await navigation.getByRole("button", {name:"Menu", exact:true}).click();
            await navigation.getByRole("button", {name:/Switch engagement/}).waitFor();
            assert.match(await navigation.getByRole("button", {name:/Switch engagement/}).innerText(), /Riverside Church/);
            if (width < 900) await navigation.getByRole("button", {name:"Close navigation", exact:true}).click();
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
          if(path==="/control") assert.equal(new URL(page.url()).pathname,"/admin");
          if(path==="/admin") {
            const row=page.locator(".eng-row").filter({has:page.locator(`a[href="/admin/${room.id}"]`)});
            assert.equal(await row.getByRole("link",{name:"Continue setup",exact:true}).count(),1,"a workshop in Setup leads with Continue setup");
            await row.getByRole("button",{name:"More actions",exact:true}).click();
            for(const label of ["Overview","Run of show","People","Results"]) assert.equal(await page.getByRole("menuitem",{name:label,exact:true}).count(),1,label);
            await page.keyboard.press("Escape");
          }
          if(path===`/admin/${room.id}`) {
            assert.equal(await page.getByRole("heading",{name:"Staff planning workshop",level:1}).count(),1,"Overview is headed by the event title");
            assert.equal(await page.getByRole("progressbar",{name:"Getting ready"}).count(),1);
            assert.equal(await page.getByRole("heading",{name:"On the day",exact:true}).count(),1);
            assert.equal(await page.getByRole("heading",{name:"Admin link",exact:true}).count(),0);
            assert.match(await page.locator(".eng-code").innerText(),/^[A-Z0-9]{4} [A-Z0-9]{4}$/);
            assert.equal(await page.getByRole("heading",{name:"Invite the room",exact:true}).count(),1); assert.equal(await page.getByRole("button",{name:"Copy link",exact:true}).count(),1); assert.equal(await page.getByRole("img",{name:`QR code for ${clearwayHost}/`}).count(),1); }
        }
        if(process.env.KIT_SHOTS) { await mkdir(process.env.KIT_SHOTS,{recursive:true}); await page.screenshot({path:`${process.env.KIT_SHOTS}/${path.replace(room.id,"engagement").replaceAll("/","-").slice(1)}-${width}.png`,fullPage:true}); }
      }
    }
    if(!before && area==="a") {
      await context.grantPermissions(["clipboard-read","clipboard-write"],{origin:app.origin});
      await page.goto(app.origin+"/admin");
      const row=page.locator(".eng-row").filter({has:page.locator(`a[href="/admin/${room.id}"]`)});
      const search=page.getByRole("searchbox",{name:"Search churches and events"});
      await search.fill("no event uses this unique phrase");
      await page.getByRole("heading",{name:"No matching engagements"}).waitFor();
      await search.fill("Staff planning workshop");
      await row.waitFor();
      await page.getByRole("button",{name:"Kind",exact:true}).click();
      await page.getByRole("menuitem",{name:"Wayfinding",exact:true}).click();
      await page.getByRole("heading",{name:"No matching engagements"}).waitFor();
      await page.getByRole("button",{name:"Kind",exact:true}).click();
      await page.getByRole("menuitem",{name:"Workshop",exact:true}).click();
      await page.getByRole("button",{name:"Brand",exact:true}).click();
      await page.getByRole("menuitem",{name:"Clearway",exact:true}).click();
      await row.getByRole("button",{name:"Copy link",exact:true}).click();
      await page.getByRole("status").filter({hasText:"Link copied:"}).waitFor();
      assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).startsWith(app.origin+"/"));
      assert.equal(await page.getByRole("tab",{name:/^No date yet/}).count(),1);
      assert.equal(await page.getByRole("tab",{name:/^Past/}).count(),1);
      assert.equal(await page.getByRole("tab",{name:/^Practice/}).count(),1);
      const archived=page.getByRole("tab",{name:/^Archived/});
      if(await archived.count()) {
        await row.getByRole("button",{name:"More actions",exact:true}).click();
        await page.getByRole("menuitem",{name:"Archive",exact:true}).click();
        await page.getByRole("dialog",{name:"Archive Staff planning workshop?"}).getByRole("button",{name:"Archive",exact:true}).click();
        await row.waitFor({state:"detached"});
        await archived.click();
        await page.locator(".eng-row").filter({hasText:"Staff planning workshop"}).getByRole("button",{name:"Restore",exact:true}).click();
        await page.getByRole("tab",{name:/^Upcoming/}).click();
        await row.waitFor();
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
      await page.goto(`${app.origin}/admin/${room.id}/details`);
      assert.equal(await page.getByLabel("Date",{exact:true}).count(),1);
      assert.equal(await page.getByText("Set when created",{exact:true}).count(),1,"the kind is read only");
      assert.equal(await page.getByLabel("Lens 1",{exact:true}).count(),0);
      assert.equal(await page.getByLabel("Governance body’s name",{exact:true}).count(),0);
      assert.equal(await page.getByLabel("Scripture translation",{exact:true}).count(),0);
      assert.equal(await page.getByLabel("TV theme",{exact:true}).count(),0,"the screen's settings live on Screens");
      await sql.query("update public.engagements set type='wayfinding' where id=$1",[room.id]);
      await page.reload();
      assert.equal(await page.getByLabel("Lens 1",{exact:true}).count(),1,"Wayfinding keeps its settings");
      await sql.query("update public.engagements set type='team_workshop',status='setup' where id=$1",[room.id]);
      await page.reload();
      await facilitator(env,sql,room.id);
      const linkSetup=await fac.client.rpc("event_link",{p_engagement:room.id,p_action:"create"});
      assert.equal(linkSetup.data?.status,"ok");
      const coFacilitators=async()=>(await sql.query(
        "select u.kind from public.engagement_facilitators f join public.clearway_users u on u.id=f.clearway_user_id where f.engagement_id=$1 and f.role='co_facilitator' and not f.deleted order by u.kind",[room.id])).rows.map(row=>row.kind);
      assert.deepEqual(await coFacilitators(),["link_guest","person"]);
      const title=page.getByRole("textbox",{name:"Event title",exact:true});
      const titleBefore=await title.inputValue();
      await title.fill("Workshop draft");
      await page.getByText("1 unsaved change: Event title",{exact:true}).waitFor();
      const noveteraRadio=page.getByRole("radio",{name:"Novetera",exact:true});
      let releaseFailure!: () => void;
      const waitForFailure=new Promise<void>(resolve=>{ releaseFailure=resolve; });
      await page.route("**/api/setup/details",async route=>{
        await waitForFailure;
        await route.fulfill({status:503,json:{ok:false,message:"Brand save failed in this fixture."}});
      },{times:1});
      try {
        await noveteraRadio.check();
        assert.equal(await noveteraRadio.isChecked(),true,"the pending radio selection shows immediately");
      } finally { releaseFailure(); }
      await page.getByRole("alert").filter({hasText:"Brand save failed in this fixture."}).waitFor();
      assert.equal(await page.getByRole("radio",{name:"Clearway",exact:true}).isChecked(),true,"a failed write rolls the selection back");
      assert.equal(await title.inputValue(),"Workshop draft","rollback preserves pending typed fields");
      await noveteraRadio.check();
      const changedBrand=page.getByRole("status").filter({hasText:"Brand changed to Novetera"});
      await changedBrand.getByRole("button",{name:"Undo",exact:true}).click();
      await changedBrand.waitFor({state:"hidden"});
      assert.equal(await page.getByRole("radio",{name:"Clearway",exact:true}).isChecked(),true,"Undo restores brand");
      assert.equal(await title.inputValue(),"Workshop draft","immediate save and Undo preserve another field's typed draft");
      const aiSwitch=page.getByRole("switch",{name:"Use AI in live sessions",exact:true});
      const aiBefore=await aiSwitch.getAttribute("aria-checked");
      await aiSwitch.click();
      const aiToast=page.getByRole("status").filter({hasText:aiBefore === "true" ? "AI is off in live sessions" : "AI is on in live sessions"});
      await aiToast.getByRole("button",{name:"Undo",exact:true}).click();
      await aiToast.waitFor({state:"hidden"});
      assert.equal(await aiSwitch.getAttribute("aria-checked"),aiBefore);
      assert.deepEqual(await coFacilitators(),["link_guest","person"],"immediate changes and Undo preserve both assignments");
      assert.equal((await sql.query("select title from public.engagements where id=$1",[room.id])).rows[0].title,titleBefore,"an immediate setting never saves the draft");
      const overviewHref=page.getByRole("link",{name:"Overview",exact:true});
      const menu=page.getByRole("button",{name:"Menu",exact:true});
      if(!(await overviewHref.isVisible())) await menu.click();
      await overviewHref.click();
      const leave=page.getByRole("dialog",{name:"Leave without saving?",exact:true});
      await leave.getByRole("button",{name:"Keep editing",exact:true}).click();
      const closeNavigation=page.getByRole("button",{name:"Close navigation",exact:true});
      if(await closeNavigation.isVisible()) await closeNavigation.click();
      else if(await menu.isVisible() && await menu.getAttribute("aria-expanded")==="true") await menu.click();
      await page.getByRole("button",{name:"Discard",exact:true}).click();
      assert.equal(await title.inputValue(),titleBefore);
      await title.fill("Workshop keyboard save");
      await page.keyboard.press("Control+s");
      await page.getByRole("status").filter({hasText:/^Saved$/}).waitFor();
      assert.equal((await sql.query("select title from public.engagements where id=$1",[room.id])).rows[0].title,"Workshop keyboard save");
      await title.fill(titleBefore);
      await page.getByRole("button",{name:"Save changes",exact:true}).click();
      await page.getByRole("button",{name:"Save changes",exact:true}).waitFor({state:"hidden"});
      // Logo upload and removal use the same Save bar; content validation still happens on upload.
      const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lK0AAAAASUVORK5CYII=","base64");
      assert.equal(await page.getByText("No logo",{exact:true}).count(),1,"a church without a logo shows the empty box");
      await page.locator('input[type="file"]').setInputFiles({name:"logo.png",mimeType:"image/png",buffer:png});
      await page.getByRole("img",{name:"Church logo preview"}).waitFor();
      await page.getByRole("status").filter({hasText:"Logo ready. Save to keep it."}).waitFor();
      await page.getByRole("button",{name:"Save changes",exact:true}).click();
      await page.getByRole("button",{name:"Save changes",exact:true}).waitFor({state:"hidden"});
      await page.reload(); await page.getByRole("img",{name:"Church logo preview"}).waitFor();
      assert.ok(await page.getByRole("img",{name:"Church logo preview"}).evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0),"the saved logo loads after a reload");
      await page.locator('input[type="file"]').setInputFiles({name:"logo.png",mimeType:"image/png",buffer:Buffer.from("this is only text")});
      await page.getByRole("alert").filter({hasText:"Use a PNG, JPEG or WebP image."}).waitFor();
      await page.getByRole("button",{name:"Remove",exact:true}).click();
      await page.getByRole("button",{name:"Save changes",exact:true}).click();
      await page.getByRole("button",{name:"Save changes",exact:true}).waitFor({state:"hidden"});
      await page.reload(); await page.getByText("No logo",{exact:true}).waitFor();
      const timeZone=page.getByRole("combobox",{name:"Time zone",exact:true});
      assert.equal(await timeZone.inputValue(),"Eastern Time · Toronto","the picker shows the friendly name");
      await timeZone.fill("Vancouver");
      await page.getByRole("option",{name:/Pacific Time · Vancouver/}).click();
      assert.equal(await timeZone.inputValue(),"Pacific Time · Vancouver");
      await page.getByRole("button",{name:"Discard",exact:true}).click();
      await page.getByRole("button",{name:"Close engagement",exact:true}).click();
      const close=page.getByRole("dialog",{name:"Close this engagement?",exact:true});
      await close.getByText("Ends every device sign-in. Reopening asks people to sign in again.",{exact:true}).waitFor();
      await close.getByRole("button",{name:"Cancel",exact:true}).click();
      assert.equal((await sql.query("select status from public.engagements where id=$1",[room.id])).rows[0].status,"setup");
      await page.getByRole("button",{name:"Close engagement",exact:true}).click();
      await close.getByRole("button",{name:"Close engagement",exact:true}).click();
      await page.getByRole("status").filter({hasText:"Workshop ended"}).waitFor();
      const reopen=await context.request.post(app.origin+"/api/setup",{headers:{origin:app.origin},data:{id:room.id,action:"reopen_workshop"}});
      assert.equal(reopen.ok(),true,"the workshop can reopen");
      assert.deepEqual(await coFacilitators(),["link_guest","person"],"Details saves, closing and reopening retain both assignments");
      await page.reload();
      const archiveButton=page.getByRole("button",{name:"Archive",exact:true});
      if(await archiveButton.count()){
        await archiveButton.click();
        await page.getByRole("dialog",{name:"Archive this engagement?",exact:true}).getByRole("button",{name:"Cancel",exact:true}).click();
      }
      await sql.query("update public.churches set team_hub_client_id=id where id=(select church_id from public.engagements where id=$1)",[room.id]);
      const ids=(await sql.query("update public.engagements set team_hub_client_id=church_id,team_hub_engagement_id=gen_random_uuid() where id=$1 returning team_hub_client_id,team_hub_engagement_id",[room.id])).rows[0];
      const payload={action:"create",hub_client:ids.team_hub_client_id,hub_engagement:ids.team_hub_engagement_id,church:{name:"Riverside",timezone:"America/Toronto"},engagement:{title:"Planning",type:"team_workshop",status:"setup",start_date:"2027-02-20",end_date:"",retreat_start_date:"",retreat_end_date:"",base_year:"",lens_names:[],how_the_room_decides:"The team agrees together.",settings:{}}};
      const duplicate=await context.request.post(app.origin+"/api/setup",{headers:{origin:app.origin},data:payload});
      assert.equal(duplicate.status(),409); assert.equal((await duplicate.json()).existing_id,room.id);
      let churchSearches=0;
      await page.route("**/api/setup",async route=>{
        const data=route.request().postDataJSON();
        if(data.action==="hub_clients") {
          churchSearches+=1;
          assert.equal(data.search,"Riv");
          return route.fulfill({json:{ok:true,clients:[{id:ids.team_hub_client_id,name:"Riverside Church"}]}});
        }
        if(data.action==="hub_engagements") return route.fulfill({json:{ok:true,engagements:[{id:ids.team_hub_engagement_id,title:"Staff planning workshop",live_id:room.id}]}});
        return route.continue();
      });
      await page.goto(app.origin+"/admin/new");
      const churchSearch=page.getByRole("combobox",{name:"Church",exact:true});
      await churchSearch.fill("R");
      await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,275)));
      assert.equal(churchSearches,0,"one letter does not query Team Hub");
      await churchSearch.fill("Riv");
      await page.getByRole("option",{name:/^Riverside Church/}).click();
      assert.equal(churchSearches,1,"typeahead searches once after typing");
      await page.getByText("Already in Live.").waitFor();
      assert.equal(await page.getByRole("link",{name:"Open Staff planning workshop",exact:true}).getAttribute("href"),`/admin/${room.id}`);
      assert.equal(await page.getByRole("button",{name:"Create engagement",exact:true}).isDisabled(),true,"a linked engagement can’t be created twice");
      assert.equal(await page.getByLabel("Lens 1",{exact:true}).count(),0); assert.equal(await page.getByRole("radio",{name:/^Open workshop/}).isChecked(),true);
      // The four steps are four identical cards: the title sits inside the card at one size, and one button is primary.
      const steps=await page.locator(".create-flow .admin-panel:has(h2, legend)").evaluateAll(cards=>cards.map(card=>{ const title=card.querySelector("h2, legend")!, box=card.getBoundingClientRect(), at=title.getBoundingClientRect(), style=getComputedStyle(card); return {inside:at.top>=box.top+parseFloat(style.paddingTop)-1&&at.left>=box.left+parseFloat(style.paddingLeft)-1,size:getComputedStyle(title).fontSize,border:style.borderTopWidth,radius:style.borderTopLeftRadius,pad:style.paddingTop}; }));
      assert.equal(steps.length,4,"four step cards"); assert.ok(steps.every(x=>x.inside),"each title is inside its card"); for(const key of ["size","border","radius","pad"] as const) assert.equal(new Set(steps.map(x=>x[key])).size,1,`the four cards share one ${key}`);
      assert.equal(await page.locator(".create-flow .cwl-ui-button--primary").count(),1,"one primary button on the page"); assert.equal(await page.getByRole("group",{name:/^2\. What kind of event/}).count(),1,"step 2 keeps its group name");
      if(process.env.KIT_SHOTS) await page.screenshot({path:`${process.env.KIT_SHOTS}/setup-new-linked-workshop-390.png`,fullPage:true});
      await page.unroute("**/api/setup");
      // Brand on create: Clearway is selected to start, the choice is the same field as on Details, and a new engagement can start as Novetera.
      const newHub={client:randomUUID(),engagement:randomUUID()}; const sent:{body?:{engagement:{skin?:string};link_name?:string}}={};
      await page.route("**/api/setup",async route=>{
        const data=route.request().postDataJSON();
        if(data.action==="hub_clients") return route.fulfill({json:{ok:true,clients:[{id:newHub.client,name:"Lakeside Church",timezone:"America/Toronto"}]}});
        if(data.action==="hub_engagements") return route.fulfill({json:{ok:true,client:{id:newHub.client,name:"Lakeside Church",timezone:"America/Toronto"},engagements:[{id:newHub.engagement,title:"AI workshop",engagement_type:"team_workshop",start_date:"2027-03-09"}]}});
        if(data.action!=="create") return route.continue();
        // The local stack has no Team Hub, so the page's create is carried out the way the route does it: the same checks, then the same database function.
        sent.body=data; const input=setupInput(data);
        const saved=await fac.client.rpc("save_engagement",{p_id:null,p_church:input.church,p_engagement:{...input.engagement,...(data.link_name?{link_name:data.link_name}:{})},p_lead:data.lead,p_co:null,p_client:data.hub_client,p_hub_engagement:data.hub_engagement});
        assert.equal(saved.error,null,JSON.stringify(saved.error)); return route.fulfill({json:{ok:true,id:saved.data}});
      });
      await page.goto(app.origin+"/admin/new");
      await page.getByRole("combobox",{name:"Church",exact:true}).fill("Lakeside");
      await page.getByRole("option",{name:/^Lakeside Church/}).click();
      await page.getByRole("radio",{name:/^AI workshop/}).check();
      const brandGroup=page.getByRole("group",{name:"Brand",exact:true});
      if(await brandGroup.getByRole("radio",{name:"Novetera",exact:true}).count()) {
        assert.equal(await brandGroup.getByRole("radio",{name:"Clearway",exact:true}).isChecked(),true,"Clearway is selected to start");
        assert.equal(await brandGroup.getByRole("radio",{name:"Novetera",exact:true}).isEnabled(),true,"an admin can choose the brand");
        assert.equal(await page.getByText("Sets what the room sees and the room's address.",{exact:true}).count(),1,"Create and Details share the brand field");
        await brandGroup.getByRole("radio",{name:"Novetera",exact:true}).check();
      } else {
        const createBrand=page.getByRole("combobox",{name:/^Brand/});
        assert.equal(await createBrand.inputValue(),"clearway","Clearway is selected to start");
        await createBrand.selectOption("novetera");
      }
      const linkField=page.getByRole("textbox",{name:"Link name",exact:true});
      const named=await linkField.count() ? `lakeside${room.id.replace(/-/g,"").slice(0,8)}` : null;
      if(named) {
        await linkField.fill("admin");
        await page.getByText("Choose another name",{exact:true}).waitFor();
        await linkField.fill(named);
        await page.getByText("Available",{exact:true}).waitFor();
        assert.ok((await page.locator(".create-link-field").innerText()).includes(noveteraHost),"name follows the chosen brand");
      }
      await page.getByRole("button",{name:"Create engagement",exact:true}).click();
      await page.waitForURL(/\/admin\/[0-9a-f-]{36}$/); assert.equal(sent.body?.engagement.skin,"novetera","the create carries the brand");
      assert.equal((await sql.query("select skin from public.engagements where team_hub_engagement_id=$1",[newHub.engagement])).rows[0].skin,"novetera","the new engagement is stored as Novetera");
      if(named) {
        assert.equal(sent.body?.link_name,named,"the create carries the named link");
        assert.equal((await sql.query("select link_name from public.engagements where team_hub_engagement_id=$1",[newHub.engagement])).rows[0].link_name,named);
      }
      const newInvite=page.getByRole("region",{name:"Invite the room",exact:true}); await newInvite.waitFor();
      assert.ok((await newInvite.innerText()).includes(noveteraHost),`the Overview's invite card shows the Novetera address (${noveteraHost})`); assert.equal((await newInvite.innerText()).includes(clearwayHost),false,"and not the Clearway one");
      await page.unroute("**/api/setup");
      // Clearway users: the team fills the picker when the page opens, with no button pressed, and a failure offers Try again.
      let teamFails=true; const member={id:"7e1a0000-0000-4000-8000-000000000001",name:"Mara Quinn",email:"mara.quinn@clearway.co"};
      await page.route("**/api/setup",async route=>{ const data=route.request().postDataJSON(); if(data.action!=="hub_members") return route.continue(); return teamFails?route.fulfill({status:503,json:{ok:false,message:"The Team Hub connection is unavailable. Please try again later."}}):route.fulfill({json:{ok:true,members:[member]}}); });
      await page.goto(app.origin+"/admin/users"); await page.getByRole("button",{name:"Try again",exact:true}).waitFor();
      assert.equal(await page.getByRole("alert").filter({hasText:"The Team Hub connection is unavailable."}).count(),1,"a failed load says so"); assert.equal(await page.getByRole("combobox",{name:/^Team member/}).isDisabled(),true);
      teamFails=false; await page.getByRole("button",{name:"Try again",exact:true}).click();
      await page.getByRole("combobox",{name:/^Team member/}).locator("option",{hasText:"Mara Quinn"}).waitFor({state:"attached"});
      assert.equal(await page.getByRole("button",{name:"Load Clearway team"}).count(),0,"no button loads the team"); assert.equal(await page.getByRole("button",{name:"Try again",exact:true}).count(),0);
      assert.equal(await page.getByRole("button",{name:"Add Clearway user",exact:true}).isDisabled(),true,"adding waits for a member");
      await page.getByRole("combobox",{name:/^Team member/}).selectOption(member.id); assert.equal(await page.getByRole("button",{name:"Add Clearway user",exact:true}).isEnabled(),true);
      await page.goto(app.origin+"/admin/users"); await page.getByRole("combobox",{name:/^Team member/}).locator("option",{hasText:"Mara Quinn"}).waitFor({state:"attached"}); assert.equal(await page.getByRole("combobox",{name:/^Team member/}).isEnabled(),true,"the picker fills on open, with nothing pressed");
      await page.unroute("**/api/setup");
      await sql.query("update public.clearway_users set is_admin=false where email=$1",[fac.session.user.email]);
      await page.goto(`${app.origin}/admin/${room.id}/joining`); assert.equal(await page.getByRole("radio",{name:/^Anyone who has the link or code/}).isDisabled(),true,"only an admin changes open joining");
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
      await page.goto(`${app.origin}/admin/${room.id}`); assert.ok((await page.getByRole("region",{name:"Invite the room",exact:true}).innerText()).includes(`${clearwayHost}/${linkName}`),"the Overview shows the chosen link");
      // The skin: an admin switches the engagement to Novetera on Details, the room link on the Overview moves to Novetera's address, and switching back restores it.
      await sql.query("update public.clearway_users set is_admin=true where email=$1",[fac.session.user.email]);
      await page.goto(`${app.origin}/admin/${room.id}/details`);
      assert.equal(await page.getByRole("radio",{name:"Clearway",exact:true}).isChecked(),true,"the initial brand is Clearway");
      await page.getByRole("radio",{name:"Novetera",exact:true}).check();
      await page.getByRole("status").filter({hasText:"Brand changed to Novetera"}).waitFor();
      assert.equal((await sql.query("select skin from public.engagements where id=$1",[room.id])).rows[0].skin,"novetera","the skin is stored");
      await page.goto(`${app.origin}/admin/${room.id}`); const inviteCard=page.getByRole("region",{name:"Invite the room",exact:true}); const invite=await inviteCard.innerText();
      assert.ok(invite.includes(`${noveteraHost}/${linkName}`)&&invite.includes(`typed at ${noveteraHost}`),"the Overview invite card shows Novetera's address"); assert.ok(!invite.includes(`${clearwayHost}/`),"and no longer Clearway's");
      assert.equal(await inviteCard.getByRole("link",{name:`${noveteraHost}/${linkName}`,exact:true}).getAttribute("href"),`${app.noveteraOrigin}/${linkName}`,"the link opens at Novetera's address");
      await page.goto(`${app.origin}/admin/${room.id}/details`); await page.getByRole("radio",{name:"Clearway",exact:true}).check();
      await page.getByRole("status").filter({hasText:"Brand changed to Clearway"}).waitFor();
      await page.goto(`${app.origin}/admin/${room.id}`); assert.ok((await inviteCard.innerText()).includes(`${clearwayHost}/${linkName}`),"switching back restores Clearway's address");
      await sql.query("update public.clearway_users set is_admin=false where email=$1",[fac.session.user.email]);
      await page.goto(`${app.origin}/admin/${room.id}/details`); assert.equal(await page.getByRole("radio",{name:"Novetera",exact:true}).isDisabled(),true,"only an admin changes the brand");
    }
    if(!before && area==="a") {
      const pickering = await engagement(sql, ["Jane"]);
      const upcomingDate = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
      await sql.query("update public.engagements set title='Pickering AI workshop', type='team_workshop', start_date=$2, end_date=$2 where id=$1", [pickering.id, upcomingDate]);
      await sql.query("update public.engagements set start_date=$2, end_date=$2 where id=$1", [room.id, upcomingDate]);
      await page.setViewportSize({width:1440,height:1000});
      await page.goto(app.origin+"/admin");
      const workspaceNav = page.getByRole("navigation", {name:"Clearway Live",exact:true});
      const workspaceLabels = ["Engagements","Templates and blocks","Practice room","Clearway users","Operations"];
      for (const label of workspaceLabels) await workspaceNav.getByRole("link",{name:label,exact:true}).waitFor();
      assert.match((await workspaceNav.getByRole("link",{name:"Engagements",exact:true}).getAttribute("aria-description")) ?? "", /^\d+ upcoming$/);
      await workspaceNav.getByRole("button",{name:"Collapse the sidebar"}).click();
      await workspaceNav.getByRole("button",{name:"Expand the sidebar"}).waitFor();
      assert.equal((await workspaceNav.boundingBox())?.width,64);
      for (const label of workspaceLabels) assert.equal(await workspaceNav.getByRole("link",{name:label,exact:true}).getAttribute("title"),label);
      await page.reload();
      await workspaceNav.getByRole("button",{name:"Expand the sidebar"}).waitFor();
      await page.keyboard.press("Control+Backslash");
      await workspaceNav.getByRole("button",{name:"Collapse the sidebar"}).waitFor();
      assert.equal((await workspaceNav.boundingBox())?.width,248);
      await workspaceNav.getByRole("button",{name:/^Account menu/}).click();
      await workspaceNav.getByRole("menuitem",{name:"Sign out",exact:true}).waitFor();
      await page.keyboard.press("Escape");

      await page.goto(`${app.origin}/admin/${room.id}`);
      const engagementNav = page.getByRole("navigation",{name:"Engagement",exact:true});
      const workshopLabels = ["Overview","Details","People","Run of show","Screens","Live room","Results","All engagements"];
      for (const label of workshopLabels) await engagementNav.getByRole("link", {name:label,exact:true}).waitFor();
      for (const label of ["Door list","People and joining","Discover","Four Helpful Lists","Overnight review","After the retreat","Report","Visibility plan","Read-only copy","Check-ins"]) {
        assert.equal(await engagementNav.getByRole("link",{name:label,exact:true}).count(),0);
      }
      const switcher = engagementNav.getByRole("button",{name:/^Switch engagement/});
      await switcher.click();
      const search = engagementNav.getByRole("searchbox",{name:"Search upcoming engagements"});
      await search.fill("pickering");
      const next = engagementNav.getByRole("link",{name:/Pickering AI workshop/});
      assert.equal(await next.getAttribute("href"),`/admin/${pickering.id}`);
      await next.click();
      await page.waitForURL(`**/admin/${pickering.id}`);
      await page.keyboard.press("Control+k");
      const command = page.getByRole("combobox",{name:"Jump to an event, page or action"});
      await command.fill("pick live");
      await page.getByRole("option",{name:/Live room · Pickering AI workshop/}).waitFor();
      await command.press("Enter");
      await page.waitForURL(`**/control/${pickering.id}`);
      await page.keyboard.press("Control+k");
      const recent = page.getByRole("group",{name:"Recent"});
      await recent.getByRole("option",{name:/Live room · Pickering AI workshop/}).waitFor();
      await page.keyboard.press("Escape");

      await page.goto(`${app.origin}/admin/${room.id}`);
      await page.evaluate(() => localStorage.removeItem("clearway-live.navigation-sidebar.v1"));
      await page.goto(`${app.origin}/admin/${room.id}/run-of-show`);
      await engagementNav.getByRole("button",{name:"Expand the sidebar"}).waitFor();
      assert.equal((await engagementNav.boundingBox())?.width,64);
      await page.setViewportSize({width:390,height:850});
      await engagementNav.getByRole("button",{name:"Menu",exact:true}).click();
      await page.getByRole("dialog",{name:"Navigation"}).getByRole("link",{name:"People",exact:true}).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog",{name:"Navigation"}).waitFor({state:"hidden"});

      await sql.query("update public.engagements set type='wayfinding' where id=$1",[pickering.id]);
      await pickering.session("Four Helpful Lists","four_lists","Collect ideas",1);
      await page.setViewportSize({width:1440,height:1000});
      await page.goto(`${app.origin}/admin/${pickering.id}`);
      for (const label of [...workshopLabels,"Discover","Four Helpful Lists","Overnight review","After the retreat","Report","Visibility plan","Read-only copy","Check-ins"]) {
        await engagementNav.getByRole("link",{name:label,exact:true}).waitFor();
      }
      assert.equal(await engagementNav.getByRole("group",{name:"Run",exact:true}).getByRole("link",{name:"Four Helpful Lists",exact:true}).count(),1);

      // Without a Team Hub connection the card says so in one line and draws no controls that can't work.
      await page.goto(app.origin+"/admin/users"); await page.getByText("The Team Hub connection is unavailable. Please try again later.",{exact:true}).waitFor();
      for(const name of ["Load Clearway team","Add Clearway user","Try again"]) assert.equal(await page.getByRole("button",{name}).count(),0,`no ${name} button without Team Hub`); assert.equal(await page.getByRole("combobox",{name:/^Team member/}).count(),0);
      await page.route("**/api/operations",route=>route.request().method()==="GET"?route.fulfill({json:{status:"ok",eligible_files:0,protected_files:0,protected_bytes:0,pending:0,last_run:null,last_recovery_check:null,last_alert:null,errors:[],backups:[]}}):route.continue());
      await page.goto(app.origin+"/admin/operations"); await page.getByText("No protected copies yet.",{exact:true}).waitFor(); assert.equal(await page.getByRole("heading",{name:"Recent protected copies"}).count(),1); await page.unroute("**/api/operations");
      await sql.query("update public.clearway_users set is_admin=false where email=$1",[fac.session.user.email]);
      const denied=await page.goto(app.origin+"/admin/users"); assert.equal(denied?.status(),404,"only admins reach user administration");
      await page.goto(app.origin+"/admin");
      assert.equal(await workspaceNav.getByRole("link",{name:"Clearway users",exact:true}).count(),0);
      assert.equal(await workspaceNav.getByRole("link",{name:"Operations",exact:true}).count(),0);
      await workspaceNav.getByRole("button",{name:"Jump to",exact:true}).click();
      await command.fill("pick live");
      await page.getByText("No matches",{exact:true}).waitFor();
      assert.equal(await page.getByRole("option",{name:/Pickering/}).count(),0,"the unassigned facilitator can't find the event");
      await page.keyboard.press("Escape");
      const outsider=await browser.newPage(); await outsider.goto(app.origin+"/admin"); assert.equal(new URL(outsider.url()).pathname,"/sign-in"); await outsider.close();
    }
    if(!before && (area==="c" || area==="all")) {
      // Open joining: the Door list shows who joined by name, never says to add people in setup, has no Refresh button and keeps up on its own.
      await sql.query("update public.engagements set type='team_workshop',settings=coalesce(settings,'{}'::jsonb)||'{\"open_join\":true}'::jsonb where id=$1",[room.id]);
      await sql.query("delete from public.attendees where engagement_id=$1 and email like '%@guest.clearway.invalid'",[room.id]);
      await sql.query("insert into public.attendees(engagement_id,name,email) values($1,'Kit Dana',$2)",[room.id,`guest-dana-${room.id}@guest.clearway.invalid`]);
      await page.setViewportSize({width:1440,height:1000}); await page.goto(`${app.origin}/admin/${room.id}/door`); await page.waitForLoadState("networkidle");
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
      const back=page.getByRole("link",{name:"Back to the engagement",exact:true}); assert.equal(await back.getAttribute("href"),`/admin/${room.id}`,"the live room links back to the Overview");
      // 2. At 1512 the run of show and the screens fill the window; Room admin is a drawer, hidden until called.
      // A facilitator who has never opened Room admin (the kits open it for everyone else).
      await page.evaluate(()=>localStorage.setItem("clearway-live.room-admin","closed")); await page.goto(control); await page.waitForLoadState("networkidle");
      const columns=async()=>page.locator(".ctl-cols").evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length);
      assert.equal(await columns(),2,"two columns at 1512 with Room admin hidden"); assert.equal(await page.locator(".ctl-side").isVisible(),false,"Room admin starts hidden");
      assert.equal(await page.locator(".ctl-run-toggle").isVisible(),false,"no fold button at 1512"); assert.equal(await page.locator(".ctl-run-list").first().isVisible(),true,"the run of show shows at 1512");
      const colX=async(sel:string)=>(await page.locator(sel).first().boundingBox())!.x;
      assert.ok(await colX(".ctl-screen.is-preview")<await colX(".ctl-screen.is-live"),"preview left, live right");
      await page.getByRole("button",{name:"Room admin",exact:true}).click(); assert.equal(await columns(),3,"Room admin opens as a third column");
      assert.ok(await colX(".ctl-run")<await colX(".ctl-centre")&&await colX(".ctl-centre")<await colX(".ctl-side"),"run of show, screens and Room admin run left to right");
      await page.getByRole("button",{name:"Room admin",exact:true}).click(); await page.locator(".ctl-side").waitFor({state:"hidden",timeout:2000}); assert.equal(await columns(),2,"and hides again, after it slides away");
      // The transport leads with the Navy Go live button and its orange icon tile.
      const take=(await page.locator(".ctl-transport .ctl-take").boundingBox())!, bar=(await page.locator(".ctl-transport").boundingBox())!;
      assert.ok(take.height>=63&&take.width>=199,`Go live is at least 64 by 200: ${take.width}x${take.height}`);
      const golive = await page.evaluate(() => {
        const transport = document.querySelector<HTMLButtonElement>(".ctl-take")!;
        const colors: string[] = [];
        for (const token of ["--cwl-action-live", "--cwl-action-live-surface"]) {
          const probe = document.createElement("span");
          probe.style.color = `var(${token})`;
          transport.append(probe);
          colors.push(getComputedStyle(probe).color);
          probe.remove();
        }
        const [orange, navy] = colors;
        const buttons = [...document.querySelectorAll<HTMLButtonElement>(".is-golive")];
        return {
          orange, navy,
          labels: buttons.map(button => {
            const style = getComputedStyle(button);
            const tile = button.querySelector(".ctl-golive-tile, svg");
            return {
              size: parseFloat(style.fontSize), weight: Number(style.fontWeight),
              background: style.backgroundColor, tile: tile && getComputedStyle(tile).backgroundColor, disabled: button.disabled,
            };
          }),
          others: [...document.querySelectorAll("body *")].filter(element => {
            if (element.closest(".is-golive, .ctl-run-actions .is-go")) return false;
            const style = getComputedStyle(element);
            return [style.backgroundColor, style.borderTopColor, style.color].includes(orange);
          }).map(element => element.className).slice(0,5),
        };
      });
      assert.ok(golive.labels.length >= 1, "the transport bar has Go live");
      const outlines = await page.locator(".ctl-run-actions .is-go:not(:disabled)").evaluateAll(elements => elements.map(element => getComputedStyle(element).borderTopColor));
      assert.ok(outlines.length > 0 && outlines.every(color => color === golive.navy), "run list Go live buttons have Navy outlines");
      for (const label of golive.labels) {
        assert.ok(label.size >= 19 && label.weight >= 700, "large Go live labels stay bold and readable");
        if (!label.disabled) {
          assert.equal(label.background, golive.navy, "Go live has a Navy fill");
          assert.equal(label.tile, golive.orange, "Go live has an orange icon tile");
        }
      }
      assert.deepEqual(golive.others, [], "Go live owns the Orange accent");
      assert.ok(bar.y+bar.height<=982+1,"the transport bar is in view without scrolling");
      assert.equal(await page.locator(".ctl-screen.is-preview .ctl-take").count(),0,"no Go live on the preview screen itself");
      const wide=async(sel:string)=>(await page.locator(sel).boundingBox())!.width;
      assert.ok(await wide(".ctl-screen.is-live")<await wide(".ctl-screen.is-preview"),"the live monitor is smaller than the preview");
      await page.getByRole("button",{name:"Room admin",exact:true}).click();
      assert.equal(await page.locator(".ctl-side").getByRole("button",{name:"TV view on phones",exact:true}).count(),1,"TV view on phones lives in Room admin");
      assert.equal(await page.locator(".ctl-side").getByRole("button",{name:"Refresh phones",exact:true}).count(),1,"Refresh phones lives in Room admin");
      assert.equal(await page.locator(".ctl-centre").getByRole("button",{name:"Refresh phones",exact:true}).count(),0,"and not in the centre column");
      await page.getByRole("button",{name:"Room admin",exact:true}).click(); await page.locator(".ctl-side").waitFor({state:"hidden",timeout:2000});
      // The page never scrolls past the live room.
      assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),"nothing below the live room at 1512");
      // 3. The room's identity, on the engagement's own address.
      const identity=page.getByTestId("room-identity");
      let line=await identity.innerText(); assert.ok(line.includes(`${clearwayHost}/${linkName}`)&&line.includes(`Room code ${code}`)&&line.includes("Clearway")&&/\d+ in the room/.test(line),`identity line: ${line}`);
      assert.equal(await identity.getByRole("link",{name:/in the room$/}).getAttribute("href"),"#ctl-door","the count goes to the door list on this page");
      await identity.getByRole("link",{name:/in the room$/}).click(); assert.equal(await page.locator("#ctl-door").isVisible(),true,"the count opens Room admin at the door list");
      await sql.query("update public.engagements set skin='novetera' where id=$1",[room.id]); await page.goto(control); await page.waitForLoadState("networkidle");
      line=await page.getByTestId("room-identity").innerText(); assert.ok(line.includes(`${noveteraHost}/${linkName}`)&&line.includes("Novetera")&&!line.includes(clearwayHost),`a Novetera engagement shows its own address: ${line}`);
      assert.equal(await page.getByRole("heading",{name:"Live room",level:1}).count(),1,"the control surface stays Clearway Live");
      if(process.env.KIT_SHOTS) { await mkdir(process.env.KIT_SHOTS,{recursive:true}); await page.screenshot({path:`${process.env.KIT_SHOTS}/control-1512.png`}); }
      // Half a laptop screen: the live screen first, then the preview, the transport bar and the controls, the run of show folded after.
      await page.setViewportSize({width:756,height:982}); await page.goto(control); await page.waitForLoadState("networkidle");
      const top=async(loc:import("playwright").Locator)=>(await loc.boundingBox())!.y;
      assert.ok(await top(page.locator(".ctl-screen.is-live"))<await top(page.locator(".ctl-screen.is-preview")),"the live screen sits above the preview");
      assert.ok(await top(page.locator(".ctl-take"))<await top(page.locator(".ctl-run")),"the transport bar's Go live sits above the run of show");
      assert.ok(await top(page.locator(".ctl-screen.is-preview"))<await top(page.locator(".ctl-run")),"the screens sit above the run of show");
      assert.equal(await page.locator(".ctl-run-list").first().isVisible(),false,"the run of show is folded");
      await page.getByRole("button",{name:"Show the run of show",exact:true}).click(); assert.equal(await page.locator(".ctl-run-list").first().isVisible(),true,"it opens on request");
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"the live room fits 756px");
      if(process.env.KIT_SHOTS) { await page.getByRole("button",{name:"Hide the run of show",exact:true}).click(); await page.evaluate(()=>scrollTo(0,0)); await page.screenshot({path:`${process.env.KIT_SHOTS}/control-756.png`}); await page.screenshot({path:`${process.env.KIT_SHOTS}/control-756-full.png`,fullPage:true}); }
      await page.setViewportSize({width:1512,height:982}); await page.goto(control); await page.waitForLoadState("networkidle");
      // The AI notice links to the AI card on Details.
      await press(fac,sql,room.id,"go_live",{session:wall}); await page.goto(control); await page.waitForLoadState("networkidle");
      assert.equal(await page.locator("[data-ai-panel]").getByRole("link",{name:"the engagement's setup",exact:true}).getAttribute("href"),`/admin/${room.id}/details#details-ai`);
      await press(fac,sql,room.id,"nothing_live");
      // The pages around it lead on.
      await page.goto(`${app.origin}/admin/${room.id}/door`); assert.equal(await page.getByRole("link",{name:"Go to the live room",exact:true}).getAttribute("href"),`/control/${room.id}`,"the Door list leads to the live room");
      await page.goto(`${app.origin}/admin/${room.id}/run-of-show`); assert.equal(await page.getByRole("link",{name:"Go to the live room",exact:true}).getAttribute("href"),`/control/${room.id}`,"the run of show leads to the live room");
      await page.goto(`${app.origin}/admin`); const row=page.locator(`.eng-row:has(a[href*="${room.id}"])`);
      assert.equal(await row.getByTestId("brand-label").innerText(),"Novetera","the list names the engagement's brand");
      if(process.env.KIT_SHOTS) { await page.screenshot({path:`${process.env.KIT_SHOTS}/list-1512.png`}); await page.setViewportSize({width:756,height:982}); await page.screenshot({path:`${process.env.KIT_SHOTS}/list-756.png`}); await page.setViewportSize({width:1512,height:982}); }
      await page.goto(`${app.origin}/admin/${room.id}/tv`); assert.equal(await page.locator("#tv-texture").count(),0,"a Novetera engagement has no texture setting");
      const theme=page.getByRole("group",{name:"TV theme",exact:true});
      assert.deepEqual(await theme.locator("label").allTextContents(),["Charcoal","Chalk"]);
      await theme.getByRole("radio",{name:"Chalk",exact:true}).check();
      const themeToast=page.getByRole("status").filter({hasText:"TV theme changed"});
      await themeToast.getByRole("button",{name:"Undo",exact:true}).click();
      await themeToast.waitFor({state:"hidden"});
      assert.equal(await theme.getByRole("radio",{name:"Charcoal",exact:true}).isChecked(),true);
      await sql.query("update public.engagements set skin='clearway' where id=$1",[room.id]);
      await page.goto(`${app.origin}/admin`); assert.equal(await page.locator(`.eng-row:has(a[href*="${room.id}"])`).getByTestId("brand-label").innerText(),"Clearway");
      await page.goto(`${app.origin}/admin/${room.id}/tv`); assert.equal(await page.locator("#tv-texture").count(),1,"a Clearway engagement keeps it");
      assert.deepEqual(await theme.locator("label").allTextContents(),["Navy","Off-White"]);
      const sizes=page.getByRole("radiogroup",{name:"Type size on the TV",exact:true});
      assert.deepEqual(await sizes.getByRole("radio").allTextContents(),["Smallest","Smaller","Medium","Larger","Largest"]);
      await sizes.getByRole("radio",{name:"Larger",exact:true}).click();
      const sizeToast=page.getByRole("status").filter({hasText:"Type size on the TV changed"});
      await sizeToast.waitFor();
      assert.equal(await sizes.getByRole("radio",{name:"Larger",exact:true}).getAttribute("aria-checked"),"true");
      assert.equal((await sql.query("select settings->>'room_size' as size from public.engagements where id=$1",[room.id])).rows[0].size,"small","larger type is the small room scale");
      await sizeToast.getByRole("button",{name:"Undo",exact:true}).click();
      await sizeToast.waitFor({state:"hidden"});
      assert.equal(await sizes.getByRole("radio",{name:"Largest",exact:true}).getAttribute("aria-checked"),"true");
      assert.equal(await page.getByRole("button",{name:"Save display settings",exact:true}).count(),0);
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
      const more=page.getByTestId("header-more"); assert.equal(await more.getAttribute("aria-expanded"),"false");
      await more.click(); assert.equal(await more.getAttribute("aria-expanded"),"true"); await page.keyboard.press("Escape"); assert.equal(await more.getAttribute("aria-expanded"),"false","Escape closes More"); assert.ok(await more.evaluate(el=>el===document.activeElement),"focus returns to More");
      await more.click(); assert.equal(await page.getByRole("menuitem",{name:"Print run of show",exact:true}).getAttribute("href"),`/admin/${room.id}/run-of-show/print`,"Print keeps its link");
      await page.getByTestId("end-workshop").click(); const ask=page.getByRole("alertdialog",{name:"End the workshop?"});
      assert.ok(/Phones are signed out and answers close\. Results stay/.test(await ask.innerText()),"the confirm says what happens");
      if(process.env.KIT_SHOTS) await page.screenshot({path:`${process.env.KIT_SHOTS}/end-workshop-1512.png`});
      await ask.getByRole("button",{name:"Keep the workshop going",exact:true}).click(); assert.equal(await status(),"setup","keeping it going changes nothing");
      await more.click(); await page.getByTestId("end-workshop").click(); await page.getByTestId("end-workshop-confirm").click();
      await page.getByTestId("workshop-ended").waitFor(); assert.equal(await status(),"closed","the same closed status Details sets");
      // Reopen the workshop from the live room: the status goes back to setup and End the workshop returns.
      await page.getByTestId("reopen-workshop").click(); await page.getByTestId("workshop-ended").waitFor({state:"detached"});
      assert.equal(await status(),"setup","Reopen puts the workshop back to setup");
      await page.goto(`${app.origin}/control/${room.id}/recap`); await page.waitForLoadState("networkidle");
      assert.equal(await page.getByRole("link",{name:"Back to the engagement",exact:true}).last().getAttribute("href"),`/admin/${room.id}`,"Results leads back to the engagement");
      assert.equal(await page.locator("main").getByRole("link",{name:"All engagements",exact:true}).getAttribute("href"),"/admin");
      if(process.env.KIT_SHOTS) { await page.screenshot({path:`${process.env.KIT_SHOTS}/results-1512.png`,fullPage:true}); await page.setViewportSize({width:756,height:982}); await page.screenshot({path:`${process.env.KIT_SHOTS}/results-756.png`,fullPage:true}); await page.setViewportSize({width:1512,height:982}); }
      await page.locator(".recap-end").getByTestId("end-workshop").click(); await page.getByTestId("end-workshop-confirm").click(); await page.getByTestId("workshop-ended").waitFor();
      assert.equal(await status(),"closed","Results ends the workshop too");
      await sql.query("update public.engagements set status='setup',type='wayfinding' where id=$1",[room.id]);
      await page.goto(control); await page.waitForLoadState("networkidle"); await page.getByTestId("header-more").click(); assert.equal(await page.getByTestId("end-workshop").count(),0,"Wayfinding has no End the workshop");
      await page.goto(`${app.origin}/control/${room.id}/recap`); assert.equal(await page.getByTestId("end-workshop").count(),0,"nor on its Results");
    }
    const operationsAlert = (message: { to: string[]; subject?: string }) =>
      message.to.length === 1 && message.to[0] === operationsAddress && message.subject === "Check Clearway Live";
    const unexpectedMail = mail.messages.filter(message => !operationsAlert(message));
    if (pageErrors.length) console.log("Browser errors:", JSON.stringify(pageErrors));
    if (mail.messages.some(operationsAlert)) {
      const events = app.output().match(/Clearway operational event \{[^}]*\}/g) ?? [];
      console.log("Operations alert captured by the local mailbox.", ...events);
    }
    assert.deepEqual(unexpectedMail.map(({ to, subject }) => ({ to, subject })), [], "admin audit sends no engagement mail");
    console.log(`Admin ${area} kit passed at desktop and narrow widths${before?" (baseline)":""}.`);
  } finally {await browser.close(); app.stop(); await mail.close(); await sql.end();}
}
main().catch(e=>{console.error(e);process.exit(1);});
