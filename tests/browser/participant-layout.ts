import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { interactionKinds } from "../../lib/interactions/kinds";
import { dropOptions } from "../../lib/run-of-show/builder";
import { chromium } from "playwright";

export async function testParticipantLayout() {
// A deterministic renderer check. The paired-room kit checks real transport/outbox behavior.
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {LivePhone} from './components/room/live-phone'; createRoot(document.getElementById('root')).render(<LivePhone engagement="test" church="Test church" skin={new URLSearchParams(location.search).get('skin')||'clearway'} />);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, banner: { js: "var process = { env: {} };" }, outdir: "/tmp/participant-fixture", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "fixture", setup(b) {
  b.onResolve({filter: /use-live-phone$/}, () => ({ path: "phone", namespace: "fixture" }));
  b.onResolve({filter: /^next\/navigation$/}, () => ({ path: "navigation", namespace: "fixture" }));
  b.onLoad({filter: /.*/, namespace: "fixture"}, a => ({ contents: a.path === "navigation" ? `export const useRouter=()=>({refresh(){}});` : `
    const kind=new URLSearchParams(location.search).get('kind')||'wall';
    const options=${JSON.stringify(dropOptions)};
    const step={id:'step',title:'Feedback',part:'',segment:'',interaction:kind,state:'live',prompt:'What would you say to a church leader considering this workshop?',phone_depth:'',max_sends:20,max_characters:600,max_words:100,closed_at:null,options:kind==='choice'?{items:[{key:'a',text:'Congregation or volunteer'},{key:'b',text:'Lay leader'},{key:'c',text:'Staff'},{key:'d',text:'Elder'}]}:options[kind]||{}};
    const room={name:'Test',answers:[],sessions:[step],self_paced:[]};
    const frame={session:step,state:{live_session_id:'step',version:1,results:{total:0}},display:{skin:new URLSearchParams(location.search).get('skin')||'clearway'}};
    export const useLivePhone=()=>({frame,room,answers:[],entries:[],online:true,fresh:false,clockOffset:0,reload(){},dismiss(){},submit(a){window.sent=(window.sent||[]).concat(a)}});` }));
} }] });
const css = (await Promise.all(["design/clearway-base/colors_and_type.css", "design/clearway-live/live_tokens.css", "app/globals.css", "design/novetera-live/novetera_tokens.css"].map(p => readFile(p,"utf8")))).join("\n").replace(/^@(import|tailwind)\b.*$/gm, "")+"\n"+bundle.outputFiles.filter(x=>x.path.endsWith('.css')).map(x=>x.text).join('\n');
const js = bundle.outputFiles.find(x=>!x.path.endsWith('.css'))!.text;
const browser = await chromium.launch({ channel: process.env.KIT_CHROME_CHANNEL });
await mkdir("docs/evidence/design-pass-11/participant",{recursive:true});
try {
  for (const skin of ['clearway','novetera']) for (const width of [390,1280,1440]) for (const kind of width === 390 ? ['wall','choice','content'] : interactionKinds) {
    const page = await browser.newPage({viewport:{width,height:width===1440?900:800}});
    page.on("pageerror", error => console.error("Participant fixture:", error.message));
    await page.route('https://participant.test/**', r=>r.fulfill({contentType:'text/html',body:`<!doctype html><style>${css}</style><div class="surface" data-surface="phone" data-theme="dark" data-skin="${skin}"><main><div id="root"></div></main></div><script>${js}</script>`}));
    await page.goto(`https://participant.test/?skin=${skin}&kind=${kind}`);
    await page.locator('.ph-app').waitFor();
    const box=await page.locator('.ph-app').boundingBox(); assert(box);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${skin} ${width} ${kind} horizontal overflow`);
    if(kind==='wall') {
      const input=page.locator('#ph-answer');
      if(width>=900) { const prompt=await page.locator('.ph-step-intro').boundingBox(); const answer=await input.boundingBox(); assert(prompt&&answer&&answer.x>prompt.x+prompt.width); assert(answer.height>=260); }
      await input.fill('A useful answer'); await input.press('Shift+Enter'); assert.equal(await input.inputValue(),'A useful answer\n');
      await input.press('Enter');
      assert.equal(await page.evaluate(()=>((window as unknown as {sent?: unknown[]}).sent||[]).length),width>=900?1:0);
    }
    await page.screenshot({path:`docs/evidence/design-pass-11/participant/${skin}-${width}-${kind}.png`,fullPage:true});
    await page.close();
  }
} finally { await browser.close(); }
console.log('Participant layout: both skins, every interaction at both laptop widths, mobile layout and keyboard passed.');

}
if (process.argv[1]?.endsWith("/participant-layout.ts")) testParticipantLayout().catch(error => { console.error(error); process.exitCode = 1; });
