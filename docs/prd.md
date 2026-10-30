# Clearway App: Product Requirements

Oct 29, 2026 · @Chris Vacher

Version 2, October 29, 2026. The build guide for the Clearway app: Claude Design designs from it, Codex builds from it, and Chris accepts each milestone against it.

## Summary

The Clearway app is Clearway's live facilitation platform. It is built first for the Wayfinding retreat and will grow to cover every session Clearway facilitates, replacing Mentimeter and similar tools. A shared TV shows the room's input the moment it is sent, phones carry the questions and the depth, the facilitator runs everything from a private view and a phone remote, a scribe captures what the easel can't hold, and Claude helps live and overnight. Everything sits in one engagement record that runs from Discover through the retreat and hands the plan to CORE in one deliberate step.

"Clearway app" is a working name.

**Who it serves**

| Who | How they use it |
| --- | --- |
| Clearway facilitator (Chris) and co-facilitator (Jaisy) | The control surface on a laptop, and a phone as the remote |
| Clearway scribe (Krista) | A laptop console for tagged capture, and a phone for easel photos |
| The church's team in the room | Their own phones, usually about 8 people |
| A team member who takes the remote | Their own phone, for the team-led block |
| Elders and boards | A read-only copy of the plan |
| The congregation | An open survey link during Discover |

**What success looks like**

- The room watches its own input land and move on the TV, with nothing redrawn, refreshed or revealed.
- Every submission reaches the TV in under 1 second, and the remote, TV and phones never disagree.
- No input is lost when venue wifi drops.
- The overnight read-back is ready after about 45 minutes of facilitator review.
- Vision Outcomes, goals and first steps reach CORE from the room, without being re-entered from the report.
- The report draft is assembled from the engagement record, so Chris edits rather than writes.
- A team workshop runs end to end without Mentimeter.

## The non-negotiable: the screen is alive

This is the requirement the product exists for. If the screen doesn't look and feel live, the app has failed, however good everything else is. Chris named this as the core benefit from the start: responses, poll votes, short answers, grouped responses and summaries show up on screen instantly, and as new responses arrive the existing data morphs, animates and resizes in front of the room. Nothing is static, and nothing waits for a refresh.

**What the room sees**

- Every submission appears on the TV the moment it is sent, in under 1 second. People watch their own answer land, and that moment is what draws quieter people in.
- Nothing redraws, refreshes or waits for a reveal. The screen never blanks, flickers or reloads, and there is no "show results" step anywhere in the product.
- What's already on screen responds to every new answer: words swell, bars grow and trade places, cards slide into groups, counts tick up, and group labels grow as groups gather.
- All of it moves with eased, continuous animation, calm enough to read from the back of the room, never jumping or flashing.
- AI never sits between a phone and the screen. New input shows first, and grouping rearranges it afterward.
- The remote, the TV and every phone always agree on what is live and on every count.

**How the build is held to it**

- The TV renders from state and animates from its current state to the next on every change. It never swaps in a new page or re-renders the whole view to show new data. Layout changes animate from old position to new position (the FLIP technique or an equivalent layout-animation library).
- A phone shows its own submission as sent immediately (optimistic), and the TV shows it as soon as the server accepts it.
- The 1-second budget, end to end: phone to server under 300 ms, server to TV under 300 ms, TV animation begins within one frame of receipt, leaving headroom for venue wifi.
- Every milestone from 2 onward fails its acceptance test if any shared screen redraws, refreshes, blanks or needs a reveal, or if fewer than 95 in 100 submissions reach the TV in under 1 second.
- Chris signs off the motion prototypes in the practice room before milestone 2's build starts (an entry gate, from design pass 2).
- Each submission's phone-to-TV time is logged, so the target is checked after every session.

Synrg, the reference product, already shows live results by default and moves smoothly. In its public test room, answers took one to three seconds to reach the screen and the remote and screen briefly showed different counts. The Clearway app matches Synrg's motion and beats its timing and consistency.

## Three surfaces, one room

The experience runs on three separate surfaces at once, as Synrg's does. This is the foundation of the product, and every screen in it belongs to one of them.

| Surface | Who | Device | What it is |
| --- | --- | --- | --- |
| Control | The facilitator (and co-facilitator) | A laptop, plus a phone as the remote | In charge of everything the room sees and does. It decides what's on the TV and what's on every phone, at the same time, and shows the facilitator far more than the room ever sees: what's next, presenter notes, counts, the door list, the alignment signal. It is never shown to the room |
| TV or projector | The whole room | A browser on a separate computer at the screen, connected by HDMI or screen mirroring and paired to the engagement | The headline: one idea, huge type, the room's input landing and moving live. It shows only what the control surface has put live |
| Phone | Each participant | Their own phone, no app | The depth and the input: the prompt, the full text and sources, the answer box, and their own answers |

- The three are separate clients that never share a screen. They all follow one room state on the server, so they always agree.
- The control surface drives the other two over the network. Nothing about the TV depends on the facilitator's laptop being plugged into it.
- The scribe console and the read-only copy are supporting surfaces built on the same rules.

Synrg puts it as the screen carrying the headline, every phone carrying the depth and the interaction, and the presenter's notes carrying what gets said. The Clearway app keeps that split and adds the private facilitator panel and the scribe.

## How to use this document

**Who reads what**

| Reader | Read first | Then |
| --- | --- | --- |
| Claude Design | The screen is alive, Surfaces, Interaction library, Wayfinding sessions, Design system | The milestone being designed and its screen IDs |
| Codex | The screen is alive, Decisions, Architecture, The live room engine, Data model, Integrations | The milestone being built, its acceptance criteria, and Non-functional requirements |
| Chris | Decisions, Open questions, Defaults to confirm | Each milestone's acceptance criteria when testing |

**Markings used throughout**

- **Decided** means Chris has settled it. Codex and Claude Design build within it and raise a question rather than work around it.
- **Default** means a proposed starting value that keeps the build moving. Chris can change any default. Until he does, build to it. Every default is listed in "Defaults to confirm".
- **Open** means a question only Chris can answer. Each one names the milestone that needs the answer. Nothing blocks earlier than that.

**Which source wins**

- This PRD wins on behaviour.
- The Claude Design high-fidelity files and the design system win on look. The wireframes govern layout only, not color or behaviour. Where a wireframe shows behaviour this PRD doesn't, this PRD wins (for example, wireframe orange flags on the TV become Sunrise outlines, since warning and error colors stay off the TV).
- The Clearway Brain wins on Wayfinding content and terminology. Where this PRD and the Brain disagree on Wayfinding, flag it to Chris rather than choosing.
- Chris's latest decision wins over all of the above, and the PRD is updated to match before the next milestone starts.

**Screen IDs** (SET-01, D1-05, INT-07 and so on) refer to the wireframes and user journeys canvas. The canvas boards still carry the earlier working name "Vizee" in sample URLs. Read those as the Clearway app.

## How it gets built

Three tools build it (Decided: Claude, Claude Design, Codex). Working one milestone at a time, with Chris accepting each before the next starts and design running one milestone ahead, is Default.

| Who | Owns | Hands to |
| --- | --- | --- |
| Claude, in this project | Concept, direction, this PRD, each milestone's spec and acceptance criteria, answers to product questions | Claude Design and Codex |
| Claude Design | The design system, high-fidelity screens from the wireframes, and motion prototypes for the live screen | Codex, as design files per milestone |
| Codex | Code in the app's own repository, database migrations, tests written from the acceptance criteria | Chris, for review |
| Chris | Decisions, review, and running each milestone's test in the practice room | Everyone |

**Each milestone runs the same loop**

1. Claude confirms the milestone's spec in this PRD and answers open questions it depends on with Chris.
2. Claude Design produces the high-fidelity screens and any motion prototypes for that milestone's screen IDs. Design runs one milestone ahead of the build.
3. Codex builds against the spec and the designs, writes tests from the acceptance criteria, and deploys to the preview environment.
4. Chris runs the milestone's test script in the practice room with real phones and a TV.
5. Anything learned goes back into this PRD before the next milestone starts.

**Definition of done for every milestone**

- Every acceptance criterion passes in the practice room, on the preview deployment, with real phones.
- Automated tests cover each acceptance criterion that can be automated, and run on every pull request.
- Row-level security is on for every new table, with a test proving a participant can't read facilitator-only data.
- From milestone 2 onward, the live-screen rules in "The screen is alive" pass.
- The milestone's screens match the Claude Design files, and copy follows "Words in the app".
- No open question needed by this milestone is still open.

**Environments (Default)**

| Environment | Purpose |
| --- | --- |
| Local | Codex's development, with seed data |
| Preview | A Vercel preview per pull request, on its own Supabase branch or staging project, where Chris tests |
| Production | Real churches, at live.clearway.co |

Seed data includes the practice engagement and a fictional church, "Riverside Church", with the eight people from the retreat narrative, so designs, tests and demos all use the same story.

## Decisions and constraints

**Decided** by Chris, with the date he settled each. Items from the retreat flow Chris has reviewed, and choices he delegated, are listed separately so nothing is presented as his call when it wasn't.

**Product and platform**

- Its own product, not a CORE module. CORE is the year-round operating rhythm, and many CORE churches never do Wayfinding. CORE is an outcome of the app, which hands off through one "Publish to CORE" step. (Oct 28)
- The app connects and integrates fully with CORE. (Oct 29)
- Its own repository, its own database and its own domain, connected to Team Hub and CORE. The domain is live.clearway.co, following team.clearway.co and core.clearway.co, and clearway.co/live redirects to it. Room links and QR codes use live.clearway.co directly. The app reads Team Hub through Supabase, from its server. (Oct 29)
- The stack matches CORE as closely as possible. (Oct 29)
- Data is organized around the engagement, not the retreat: church, then engagement, then Discover inputs, then sessions, then outputs. (Oct 28)
- Survey results, the Four Helpful Lists and board input conversations all live inside the platform. (Oct 28)
- Scope: Wayfinding first, and the app effectively covers anything Clearway uses Mentimeter for. The longer-term vision is one platform for all of Clearway's facilitation. (Oct 28 and 29)
- The goal is a working app, not readiness for a particular engagement or date. Chris decides open choices, and Claude presents options rather than deciding them. (Oct 29)
- Claude builds the concept and direction (this PRD), Claude Design creates the wireframes and high-fidelity designs, and Codex codes the app. (Oct 29)

**In the room**

- The screen is alive (above). Non-negotiable. (Oct 28, restated Oct 29 as "an absolute necessity")
- Three surfaces: the facilitator's control surface, the TV or projector, and participants' phones. The control surface is in charge of what's on the TV and every phone at the same time, and is never what the room sees. The TV is its own display, never cabled to the facilitator's laptop. A separate computer at the TV, provided by the church, opens the TV page at live.clearway.co and connects to the TV or projector by HDMI or screen mirroring. Clearway's prep document asks churches to have it ready. (Oct 29)
- The retreat fits in two days, with a 90-minute pre-call on video one to two weeks before. The pre-call shows survey results and does celebrations and metrics. The retreat opens on the Five Lenses, then the 3-year Vision with prioritized Vision Outcomes, then risks and roadblocks as a pre-mortem, then strategies in the 1-year Outlook that overcome those risks, then the team takes over for commander's intent, then recap and close. (Oct 28)
- Vision Outcomes are provisional on Day 1, prayed over overnight, and confirmed on Day 2 after the read-back. (Oct 28)
- Commander's intent is team-led in the second half of Day 2, and covers the intent, the must-do, what we'll stop and the 30-day first steps, without repeating the 1-year goals. (Oct 28)
- The 1-year Outlook lands as CORE goals, owned and dated. (Oct 28)
- Churches that can only give a day and a half can do a self-facilitated follow-up session. (Oct 29)
- The room decides by consensus, not an individual. Votes and points show where the room is. They never decide. (Oct 29)
- Phones come out in bursts of 3 to 5 minutes. (Oct 29)
- There is no scribe in the team-led commander's intent block. The team's cards are the record. (Oct 29)
- The alignment signal (aligned, divergent, silent, thin data) shows only on the facilitator's private view, and notices direction rather than striking out ideas. (Oct 28)
- The easel stays the primary record if the tech fails. (Oct 28)
- People can change their answers (Synrg's model, which suits 100 points), and the facilitator can hide an answer from the TV. (Oct 28)
- The communication plan is drafted by Clearway after the retreat and reviewed with the church on a call within two weeks. A draft Clearway Map is shown at the close. There are 30, 60 and 90-day check-ins on the same platform. Commander's Intent is a new report section. (Oct 28)
- This PRD describes the new, app-facilitated process. The current Preparation Guide describes today's process and isn't a source for the new one. (Oct 29)

**Access and data**

- Facilitator pages need a Clearway sign-in, which is Google sign-in with a Clearway account. (Oct 29)
- Scribes and participants reach the room by a room or church link (or QR code) and sign in by email, checked against the engagement's attendee list, which is built during setup. (Oct 29)
- No restrictions on church data beyond the roles in this PRD, for now. (Oct 29)
- AI use is disclosed to churches. (Oct 29)
- Failure states are designed, not left to chance. (Oct 29)

**Look and feel** (Oct 29)

- The design system is built in Claude Design, starting from the existing Clearway design system and customized for the live app. Chris confirmed the Clearway Design System already exists (now an artifact at https://claude.ai/artifact/HWe33WYnnbNRusJmQ8LZTA). Clearway Live, the live app's own design system built on it, is used on every surface, including the facilitator's, for one cohesive experience.
- The live app is brighter than the rest of Clearway. Royal Blue is the main live brand color. Navy is every dark screen background. Lime means live, confirm and active. Sunrise (#FFC845) is a new brand color just for the live app, for callouts and attention.
- Dark screens carry texture from the Clearway mark (circle and arrow). Chris is considering the outline version of the mark.
- The TV shows popularity by size and color, especially for 1 to 3 word answers, and shows polls and rankings as live horizontal bars.

**From the retreat flow Chris has reviewed** (written into the flow and narrative, not separately decided, and Chris can change them)

- Write before anyone speaks: exercises open with silent, anonymous input on phones before discussion.
- Answers are anonymous on screen by default.
- Five Lenses sentences are seeded privately on phones from the pre-call onward and appear first on Day 1.
- Every Vision Outcome names what the church will stop.
- Nothing AI writes reaches the room before a facilitator reviews it, with the live exceptions listed under AI.

**Delegated to Claude by Chris**

- Build order: milestones 1 to 7 as numbered. (Chris left the order to Claude, Oct 29.)

## Wayfinding for builders

The app has to serve this method exactly. Everything here comes from the Clearway Brain and this project's method file. The Brain wins if anything differs.

**The process.** Wayfinding is Clearway's flagship planning process for churches. It begins with prayer and discernment, runs four to six months, and moves through five stages: Discover, Dream, Discern, Decide, Define. Churches finish with a 3-year Vision of four to six Vision Outcomes, each with goals, owners and measurables. At minimum the senior pastor, key staff and board representation take part. A retreat team is usually about 8 people in a U-shape.

**Discover** gathers current reality before the retreat: a congregational survey, the Four Helpful Lists (the team's read in four columns: what's right, what's wrong, what's missing, what's confused), board and staff input conversations, and leadership interviews.

**The Five Lenses** describe the church's 10-year Future, written in the present tense. In order: Congregation, Community, Leadership, Operations, Learning. They are not a diagnostic of today, and they are not the 5 P's, the Five Directions or the Organizational Foundations. This project's method file notes that for an organization that isn't a church, Customer replaces Congregation, so lens names are a setting on the engagement (the one sanctioned use of "Customer").

**Horizon terms**, written exactly this way in every screen, email, prompt and export:

| Term | Meaning | Year shown in prompts |
| --- | --- | --- |
| 10-year Future | Where God is leading long-term, by lens, in the present tense | Base year + 10 (2036 for a 2026 retreat) |
| 3-year Vision | Four to six Vision Outcomes, each with success indicators | Base year + 3 (2029) |
| 1-year Outlook | Goals for the next year that meet CORE | Base year + 1 |

Numerals always, "year" lowercase and hyphenated, the noun capitalized, never mixed ("3-year Outlook" is wrong). The base year is a setting on the engagement and defaults to the year of the retreat.

**Vision Outcomes** are the church's strategic priorities. The two terms name the same thing, and "priorities" is fine in plain copy. There are four to six of them, and the app warns, without blocking, when the room confirms fewer than four or more than six. The Brain says they are owned by senior leadership.

**CORE goals.** Every 1-year goal meets CORE: Connected to a Vision Outcome, Owned by one person (not a committee or team), Result is clear so we know when it's done, End date is defined and agreed. Progress status in CORE: Green is on track (never "done"), Yellow is at risk with a plan, Red is off track with no plan. CORE is also the name of Clearway's dashboard, at core.clearway.co.

**Seasons**, never quarters: September 1 to December 31, January 1 to April 30, May 1 to August 31. CORE goals store them as SEP\_DEC, JAN\_APR and MAY\_AUG.

**The 3x3 Vision Matrix** (Clearway's "Strategic Roadmap") lays the 3-year Vision out by year and by season. CORE already holds it. The retreat produces its first year through the 1-year Outlook.

**The Clearway Map** is the two-page artifact Wayfinding produces. Page 1, Identity and Direction: Mission, Purpose, Values, Strategy, 10-year Future, 3-year Vision Outcomes. Page 2, Action: This Year's Priorities (three to five Annual Initiators), This Season's Goals, Leadership Rhythms, Key Issues. Purpose comes from the Kingdom Assignment process. Mission, Values and Strategy usually exist before the retreat.

**The report** follows this order: Overview, The Church Today, The Process, What We Heard, Leadership Interviews, Strategic Tensions, the 10-year Future, the 3-year Vision, Risks and Roadblocks, the 1-year Outlook, Commander's Intent, Decisions, Communication, Closing.

**Lessons the app must act on** (from past reports)

- At Pathway, two priorities left the room with no 3-year outcomes and were deferred to the fall. The app flags an empty Vision Outcome while the team is still in the room.
- At Pathway, under-30s were 6 of 87 survey respondents. The app flags thin data like this.
- At Global 180, four surveys drew 360 responses, the volume where live theming saves the most hours, and priorities reached CORE only after the report. The app publishes to CORE from the room.
- In both reports the 1-year Outlook was mostly activities with few owners or dates. The goal builder makes owners and dates part of every goal.

## Words in the app

Every word on every screen, email, prompt and export follows Clearway's language. Claude Design and Codex treat this as a requirement, and AI prompts include it.

| Use | Never |
| --- | --- |
| 10-year Future, 3-year Vision, 1-year Outlook | Ten-year future, three-year vision, 3-year Outlook |
| Vision Outcomes (or priorities in plain copy) | Pillars, roadmap (except "Strategic Roadmap" for the 3x3 Vision Matrix) |
| Engagement | Project (for Clearway's work with a church) |
| Churches, pastors, leaders, team | Customers (except the Customer lens for non-church organizations), stakeholders, staff group |
| Seasons | Quarters |
| Measurables, indicators, metrics | KPIs |
| Greenhouse, raising leaders | Pipeline, in any sense |
| Use | Utilize, leverage, optimize, synergy, unlock |
| The church's own term for its governance body (elders, board or governance team) | One fixed word for every church |
| Five Lenses, capitalized | five lenses |

- App copy uses sentence case, plain words and contractions. Buttons start with a verb.
- No em dashes or en dashes anywhere in app copy, prompts or exports. A spaced hyphen is the only dash, and rarely.
- Scripture and prayer screens name the translation used.
- The church's own names for things (its ministries, campuses, roles) are used as the church writes them.

## Users, roles and access

Every role is enforced in the database with row-level security, not only hidden in the interface.

| Role | Signs in by | Can | Can't |
| --- | --- | --- | --- |
| Clearway admin | Clearway sign-in | Everything: engagements, templates, people, settings, the practice room | Nothing restricted |
| Lead facilitator | Clearway sign-in, assigned to the engagement as lead | Set up and run the engagement, see the alignment signal and presenter notes, review overnight drafts, approve the door list, hand over and take back the remote, publish to CORE | Edit Clearway accounts |
| Co-facilitator | Clearway sign-in, assigned to the engagement | Everything the lead facilitator can, except publishing to CORE (Default) | Publish to CORE (Default) |
| Scribe | Room link plus email sign-in, listed as Scribe on the attendee list (Decided: scribes come in by the room link, Oct 29) | Capture tagged cards, photos and files for the live session, and see the current session's prompt | See the alignment signal, presenter notes, overnight drafts, or anyone's identity on answers |
| Participant | Room link or QR plus email sign-in, on the attendee list | Answer, see and change their own answers while a session is open, affirm, sign together, read published read-backs | See who wrote what, any facilitator view, or anything not yet published |
| Team facilitator | A participant the facilitator hands the remote to, for one block | Run that block's TV and phone controls | See the alignment signal, presenter notes, Discover data or other blocks |
| TV | A pairing code shown on the TV and entered on the control surface | Show the room | Anything else. It holds no personal data beyond what's on screen |
| Elders and board | A shared read-only link the facilitator creates and can revoke | View the published plan and its CORE status | Edit, or see raw answers, scribe cards or drafts |
| Congregation | An open survey link, no sign-in | Answer the Discover survey anonymously | Anything else |

**Sign-in** (Decided: email sign-in checked against the attendee list. The code and these mechanics are Default.)

- The invite email carries the room link. Opening it shows the room page with the person's email filled in and a "Send me a sign-in code" button. Tapping it sends a fresh six-digit code and a sign-in link.
- Codes expire after 10 minutes and allow 5 attempts. Requests are rate-limited by email and by device.
- A sign-in link signs the person in only after a tap on the page it opens, so email security scanners that open links can't use it up.
- The code works on any device, for when the link opens in the wrong browser or the email is slow (PRE-01 to PRE-04).
- People sign in at the pre-call, so retreat morning needs only a scan of the QR code (D1-01, D1-02).
- A signed-in device stays signed in until the engagement closes. Signing in on a new phone is allowed and keeps the old one signed in.
- Refreshing a signed-in phone opens the room directly, with no sign-in form flashing while the session is restored. The server validates the session before rendering the page. (Oct 30)
- Sign-in confirmation includes the person's name immediately, without waiting for the next room update. (Oct 30)
- The attendee list is built from Team Hub people, a CSV (name, email, role at the church, plus any other columns as fields), or a pasted list ("Ann Lee <ann@example.org>" per line), and is de-duplicated by email.
- An email not on the list can ask to join. The request appears on the door list (SET-03, FAC-01) and a facilitator approves it with one tap. That phone is let in without another step (PRE-05, FAIL-07).
- Telling someone their email isn't on the list reveals who is attending, so the message is gentle and the facilitator can switch it to a neutral "Check with your facilitator".
- Manual sign-in, for when email doesn't arrive at all: the person's phone shows a short device code, the facilitator enters it on the door list next to their name, and that phone is signed in (FAIL-07).
- "Signed in" and presence counts come from device sessions, never from page loads, so previews and link scanners don't inflate the count.

**Who sees authorship** (Default)

- Answers are stored with the person's identity for the record and shown anonymously.
- Names appear on screen only where a session is set to named: affirming, signing together, owning a goal or step, and presence on the join screen.
- Nobody in the room sees who wrote what. The facilitator view shows answers without names. Authorship is visible only in a facilitator's full export, for the record.
- The phone has a plain "Who sees my answers?" line on every input screen: "Your answers show on the screen without your name."

## Surfaces

**Decided:** three surfaces at once (control, TV or projector, phone), with the remote as part of the control surface and the scribe console as a supporting surface. Everything runs in a current browser with nothing to install.

| Surface | Device | Viewed from | Job |
| --- | --- | --- | --- |
| Control (facilitator view) | The facilitator's laptop | The high-top | In charge of the TV and every phone: run of show, live controls, presenter notes, the alignment signal, the door list. Never shown to the room |
| Remote | The facilitator's phone, or a team facilitator's phone | In hand, standing or walking | The live controls of the control surface, in a pocket |
| TV or projector | A browser on whatever drives the room's screen, paired to the engagement | Across the U-shape, up to about 5 metres | The headline: the live wall, bars, grids and cards |
| Phone | Each person's own phone | In hand | Input and depth: prompts, full text, sources, their own answers |
| Scribe console | The scribe's laptop, plus their phone for photos | The side table | Tagged capture that attaches to the live session |
| Setup | A laptop | Before and after | Engagements, attendees, Discover, run of show, templates, overnight review, outputs |
| Survey | Any phone or computer | Anywhere | The congregational survey |
| Read-only copy | Any browser | Elders' meetings | The published plan and its status |

**The control surface and the TV are separate** (Decided, Oct 29)

- The TV view runs in a browser on a separate computer at the TV, provided by the church (Decided October 29). It opens live.clearway.co, pairs to the engagement, and reaches the TV or projector by HDMI or screen mirroring. Clearway's prep document asks for it. A laptop on HDMI is the reference setup, and mirroring is tested in the practice room before it's relied on (Default).
- The control surface and the remote drive the TV and the phones over the network, so the facilitator can move around the room.
- Plugging a laptop into the TV by cable and showing the TV view as its own full-screen window still works as a fallback, but it isn't the setup the design assumes.
- For the pre-call on video, the facilitator shares the TV view (not the control surface) in the call.

**TV**

- Shows only what is live, in 16:9 at 1920 by 1080, readable from the back of the room.
- It is one page that never reloads once open. Moving between sessions changes what's drawn inside it. The next session is prepared behind the current one and animated in, so there is no white flash and full screen is never lost. (Synrg built a "shell" page for exactly this reason.)
- It keeps the display awake (the browser's screen wake lock) and toggles full screen with one key.
- The join screen shows the QR code, a short room link, the church's name, and names appearing as people arrive (D1-01).
- An optional join strip (a small QR code and room link along one edge) can be switched on for any session, so late arrivals can join (Default: on for the first session of each day, off otherwise).
- Between sessions or on Nothing live, it shows a quiet holding screen (Scripture, the church's name, or the Navy texture, chosen per session).
- When phones are down, the TV holds still and keeps its last content.
- A room size setting (very small, small, medium, large or very large screen for the room) scales all TV type at once and can be changed live from the remote (Default for a U-shape of 8 with one TV: "very small screen", the largest type).
- A screen check session (edge lines, a circle, a type ladder) lets the facilitator fix overscan and aspect settings before the room arrives. It lives in the practice room and at the top of every template.
- It never shows an error page, a spinner over content, a browser bar or a cursor. On disconnect it keeps the last state and shows a small "Reconnecting" mark only readable up close (FAIL-02).

**Phone**

| Phone state | What it shows |
| --- | --- |
| Not signed in | The room page, "Send me a sign-in code", then the code field |
| Waiting | The church's name, "You're in", and one line about what to expect. No instructions to read |
| Live, input open | The prompt, the input for this interaction, a burst countdown if one is running, "Sent" as each answer goes, and "Who sees my answers?" |
| Live, phones down | The prompt and the person's own answers, dimmed, with "Phones down" |
| Content | The headline on the TV with the detail, sources and Scripture underneath, to read and zoom |
| Self-paced | A session open outside the live room (pre-work, lens seeding, check-ins), reached from the room link or an email, with the person's saved answers |
| Offline | Input still works. Each unsent answer shows "Saved on this phone" and sends in order on reconnect |
| Session closed | The person's own answers for that session, read-only |
| TV down | The TV view itself, when the facilitator switches phones to it (see FAIL-02) |

- One-handed use, touch targets at least 44 px, works from 360 px wide, inputs stay above the keyboard.
- A phone follows the room. People can look back at sessions already reached, but a phone never runs ahead of the room, and it returns to the live session on its own unless the person is typing.
- A person can change their answer while the session is open (Decided) and withdraw it (Default). The TV animates the change like any other.
- Over a limit (too many words, too many characters), the phone says so and holds Send. It never cuts an answer silently.
- Phones follow the system text size and reduced-motion settings.
- Answering for someone else on the same phone is not in the first release. A person whose phone dies signs in on another device (FAIL-08).

**Control surface: the facilitator view (FAC-01)**

- It is in charge of the TV and every phone at once, and shows the facilitator more than the room sees: what's on the TV now, what's on phones now, what's next, and the private panel.
- Left: the run of show with each session's state, timing against the agenda, and Up next with its presenter notes.
- Centre: a live mirror of the TV, plus the live controls (the same as the remote).
- Right: the private panel: the alignment signal (milestone 6), the door list, counts (signed in, answered this session), scribe cards arriving, moderation, and AI actions to undo or pin.
- Everything private carries one consistent "only you see this" treatment, so it can't be mistaken for the TV if the laptop screen is ever shared.

**Remote (FAC-03)**

- Large controls: Go live on the next session, Next, Back, Nothing live, Start burst (3, 4 or 5 minutes) with a countdown, Phones down and Open phones, Spotlight an item, Hide an item from the TV, Undo the last AI merge, Refresh phones, Show the TV view on phones, and room size.
- It always shows what the TV has confirmed it is showing, not what the remote asked for. If the TV hasn't confirmed within 2 seconds, the remote shows "Syncing" until it does (FAIL-06).
- Preview: browse any session, with its phone depth and notes, without moving the room. Go live from the preview sends it.
- It shows Up next with that session's notes, and a small "On the TV now" mirror.
- The facilitator's own remote shows a short list of current alignment signals (milestone 6), so the signal still works with the laptop closed (FAIL-05). A team facilitator's remote never shows it.
- Two remotes (the facilitator's phone and laptop, or the facilitator and co-facilitator) see each other's presses at once.
- Reopening or refreshing the remote resumes where the room is. It never jumps back to the start. If it hasn't connected within 12 seconds it offers Reload and says the room is fine.
- It works with the facilitator's laptop closed (FAIL-05).

**Handing over the remote (D2-11)**

- A block is a run of consecutive sessions marked "team-led" in the run of show. In the Wayfinding template it runs from commander's intent through affirming the cards.
- The facilitator picks a person. Their phone becomes the remote for that block, with a "You have the remote" banner and a switch between the remote and their own participant view, so they can draft a card too.
- While a team facilitator holds the remote, the facilitator's and co-facilitator's remotes stay live but show "Priya has the remote" (the person's first name). They can still take it back at any moment, without the TV changing.
- The remote returns to the facilitator automatically after the block's last session, or when the facilitator takes it back. The team facilitator's phone then shows "Chris has the remote" (the facilitator's first name) and returns to participant mode.
- Publishing to CORE needs the lead facilitator, whoever holds the remote (COR-02).

**Scribe console (SCR-01, SCR-02)**

- Keyboard-first capture: a card type (quote, decision, tension, action, question), the text, and optionally who said it (for the record only, never on the TV).
- Cards attach to whatever session is live. The scribe can re-file a card to another session.
- One tap on the phone photographs the easel page and attaches it to the live session.
- Files (documents, slides, handouts) can be uploaded to the session.
- Works offline and syncs in order (FAIL-03).
- The console is switched off for the team-led block.

## Engagements, templates and the run of show

**Engagement types.** Wayfinding is the first release. The other types are where the same tools serve Clearway's Mentimeter uses (Default list, which Chris can change).

| Type | Shape | In the first release |
| --- | --- | --- |
| Wayfinding | Discover, a 90-minute pre-call, a two-day retreat, overnight review, outputs and check-ins | Yes |
| Wayfinding, day and a half | As above, with a self-facilitated follow-up session | Yes |
| Team workshop | One or more sessions from the interaction library, in place of Mentimeter | Yes, as the Mentimeter replacement |
| Practice | The permanent practice room | Yes |
| Board session, key leader gathering, other gatherings | Library interactions for other Clearway sessions | Later. They run as a team workshop until then |

**Engagement status**: setup, Discover, pre-call, retreat, follow-up, closed. Device sign-ins, the read-only copy and check-ins stay active until the facilitator closes the engagement (Default: after the 90-day check-in).

**Engagement settings** (SET-02): church, type, dates and time zone, lead facilitator and co-facilitator, base year for the horizons, lens names, the governance body's name, whether AI is on, the Scripture translation, the TV theme, texture and room size.

**Templates** (SET-08): a template is a saved run of show. Starting an engagement from a template copies its sessions, prompts, interaction settings, timings and presenter notes, all editable. The Wayfinding and day-and-a-half templates ship with the app (see "Wayfinding sessions"). Facilitators can save any run of show as a new template.

**The run of show** (SET-07) is an ordered list of sessions grouped by part (Pre-call, Day 1, Day 2, Follow-up). Each session has:

| Field | What it holds |
| --- | --- |
| Title and part | "Five Lenses: Congregation", Day 1 |
| Planned start and length | For the facilitator's timing view, never shown to the room |
| Mode | Live (runs in the room), or self-paced (open on phones between two times, outside the live room) |
| Interaction | One of the interaction library types, or a content screen |
| Prompt | What the TV and phones show, with the base year filled in |
| Phone depth | Detail, sources or Scripture that only the phones carry |
| Settings | Anonymous or named, answer limits, burst length, AI on or off, moderation, join strip |
| Presenter notes | Private to the control surface |
| Team-led | Marks the sessions in a handed-over block |
| Lands in | The report section, Clearway Map field or CORE record its output feeds |
| Seeded from | Optional: a self-paced session whose answers appear first |

**Session states**

| State | Meaning |
| --- | --- |
| Draft | Being set up. Not visible to the room |
| Ready | Set up and waiting in the run of show |
| Open (self-paced) | Taking answers on phones between its open and close times, outside the live room. Any number can be open at once |
| Live | On the TV and phones. Exactly one session is live at a time, or none (Nothing live) |
| Phones down | Live, with input locked and the TV holding |
| Closed | Finished. Its results stay viewable, and phones show the person's own answers |

**Going live**

- Go live makes a session the one live session: the TV animates to it, and every phone moves to it within 1 second.
- Nothing live puts the TV on its holding screen and phones on waiting.
- Next and Back move through the run of show. Back to a closed session shows it read-only, results included. Reopen is a separate control that opens it for input again with all earlier input in place.
- A submission queued offline is accepted after the session closes if the server receives it within 2 minutes of the close and the phone queued it before the close (Default grace window).
- Edits to a live or ready session's prompt, depth or settings go out when the facilitator presses Save, never per keystroke. Saved edits reach the TV and phones within a second, animated.

**Bursts and phones down** (Decided: 3 to 5 minutes)

- Start burst opens input with a countdown on the remote and the control surface, and a quiet countdown on phones. The TV shows no countdown (Default).
- When the burst ends, phones dim and show "Phones down". Answers typed but not sent are kept as drafts on the phone.
- The facilitator can extend a burst by a minute or end it early.
- For longer working blocks (pairs drafting intent cards), a session clock counts down and then on into overtime ("+1:30") rather than cutting people off, adjustable a minute at a time or paused.

**Facilitator controls on live content**

- Spotlight an item: it takes the Sunrise callout treatment on the TV until cleared.
- Hide an item from the TV: it fades from the TV and stays in the record, marked hidden. Unhide brings it back.
- Moderation, per session (Default off): new text answers wait on the control surface until approved one by one, all at once, or by switching moderation off. A word filter screens profanity from the TV in every session regardless (Default).
- Undo an AI merge, pin a group so AI won't change it, or turn AI off for the session. The wall then falls back to arrival order.
- Mark a decision: records what the room decided by consensus, with reasons, against the live session. These feed the report's Decisions section, together with the scribe's decision cards.
- Refresh phones reloads every phone (never the TV, which never reloads), keeping unsent drafts.
- Show the TV view on phones: for when the TV fails but the network works, every phone shows what the TV would show, with input still available underneath.

**The practice room and test answers**

- A permanent practice engagement, like Synrg's public test room, where any milestone can be rehearsed with real phones and a TV. Testers join phones with the room link and no sign-in. The control surface and remote still need a Clearway sign-in. It resets on demand and every night (Default).
- Every engagement has "Clear test answers", so a facilitator can rehearse a church's own run of show in its engagement and clear it before the real session. Clearing is logged and can't happen while a session is live.

## The live room engine

The live room is the heart of the product and the riskiest part to build. These rules apply to every interaction. Codex proposes the exact mechanism, and the milestone 2 test decides whether it's good enough.

**One room state**

- Each engagement has one room state on the server: the live session, what the TV shows, whether phones are down, the burst end time, the spotlight and hidden items, the remote holder and team-led block, phones showing the TV view, and a version number that rises on every change.
- The TV, the remote, the control surface and every phone render from that state. The remote shows what the TV has confirmed it is showing, not what the remote asked for.
- Counts shown anywhere come from one source, so the TV, remote and control surface can never show different totals.
- Every client keeps the last version it applied. If it misses a version, it fetches a fresh snapshot and animates to it, never redrawing.

**Realtime path** (Default approach, proven by the milestone 2 test)

- Phones write submissions through one server endpoint that validates the person, the session and the limits, stores the submission, and broadcasts it on the engagement's realtime channel in the same step.
- The TV and control surface subscribe to that channel (Supabase Realtime broadcast) and apply each event as a small change to what's on screen.
- Results that need computing (counts, averages, ranks, 100-point shares, word sizes) are computed once on the server and broadcast with the event, so every screen shows the same numbers.
- AI runs on a separate path. Its results arrive as their own events (a merge, a cluster label) that rearrange what's already on screen.
- A periodic snapshot check backs up the realtime channel (Default: every 5 seconds while live). Synrg calls its own 2.5-second poll the "correctness guarantee". When a snapshot differs from what's shown, the client animates the difference. It never re-renders the view, and a snapshot that matches changes nothing on screen.
- Snapshots and reads page past Supabase's default 1,000-row limit (a large Synrg room once froze on it).
- Some venues block realtime connections. The room then falls back to frequent snapshots (every 1 to 2 seconds) with the same animation rules, and the control surface shows that the room is in fallback mode.
- Phones never pile up requests on a slow server: retries back off with jitter and go one at a time (the lesson of Synrg's ATKI Canada day 2 incident).

**Ordering and duplicates**

- Every submission carries an id made on the phone, so a resend never creates a duplicate.
- Queued submissions are sent and shown in the order they were written.
- The server orders events per engagement, and clients apply them in version order.

**Failure states** (each designed in the wireframes)

| Screen | What happens |
| --- | --- |
| FAIL-01 Venue wifi drops: phones | Phones keep taking input, show "Saved on this phone" on each unsent answer, and send in order on reconnect |
| FAIL-02 The TV loses its connection | The TV keeps its last state with a small "Reconnecting" mark and animates to the current state on reconnect. If it stays down, the facilitator can show the TV view on phones |
| FAIL-03 The scribe goes offline | The scribe console queues cards and photos and syncs in order |
| FAIL-04 The TV's browser is closed | Reopening the TV address resumes on the current session without re-pairing |
| FAIL-05 The facilitator's laptop dies | The remote carries every control, including the short signal list |
| FAIL-06 The remote and the TV disagree | The TV wins. The remote shows "Syncing" after 2 seconds and corrects itself, and the control surface shows a quiet warning |
| FAIL-07 Late arrival, new phone, slow email | The door list, the sign-in code on any device, and manual sign-in |
| FAIL-08 A phone dies | The person signs in on another device and sees their own answers |
| FAIL-09 AI is slow or groups things wrongly | The room keeps working in arrival order, and the facilitator can undo, pin or switch AI off |
| FAIL-10 The tech fails completely | The easel carries the room, the scribe console keeps capturing offline, and the run of show and prompts can be printed from the control surface beforehand. This settles the earlier open question on fallback unless Chris wants more |

**Timing budget**

| Step | Budget |
| --- | --- |
| Phone tap to server accepted | Under 300 ms on venue wifi or 4G |
| Server to TV received | Under 300 ms |
| TV starts animating | Within one frame of receipt |
| Total, phone to received on the TV | Under 1 second, 95 times in 100, with 50 phones submitting |
| Stagger hold | When many answers arrive at once, the TV staggers them into a steady flow, but holds no answer more than 1.5 seconds after receipt (Default). Answers replayed after a reconnect are exempt |
| Go live to every phone moved | Under 1 second |
| Reconnect to current state | Under 3 seconds after the network returns |

**Motion rules** (exact durations and easing live in the design system)

- New items fade in where they land, and what's already there moves to make room.
- A repeated word swells over about 400 ms while its neighbours ease aside.
- Bars grow and trade places with a smooth slide, and a cut line slides with them. Bars always animate from their previous value, never back from zero. Only a session's first appearance grows from zero.
- Reordering lists (Q&A, rankings) glide rows to their new places. Synrg swaps rows in some views. The Clearway app never does.
- Similar items drift together into groups, and group labels grow as they gather.
- Nothing flashes or jumps. When phones are down, the wall holds still unless something changes.
- Reduced motion: every movement has a still equivalent (a fade or an instant change) for phones set to reduce motion, and as a TV setting.

**TV pairing (FAC-04)**

- Opening the TV address in any browser shows a large pairing code. The facilitator enters it on the control surface, and the TV joins the engagement.
- Pairing lasts until the engagement closes and survives the browser closing (Default). The facilitator can unpair or re-pair at any time.
- More than one TV can be paired to the same engagement, for larger rooms (Default).

## The interaction library

Every interaction is a TV and phone pair, and every one follows the live room engine and the motion rules. Defaults are starting values the facilitator can change per session. Where Synrg's behaviour is a useful reference, it's noted.

**General rules for every interaction**

- Before anyone answers, structured interactions (choice, scale, ranking, 100 points, grid) show their empty structure on the TV, and text interactions show a quiet "Waiting for answers".
- The TV shows a count: "8 answering" for one-answer-per-person types, "23 answers" for text types.
- One answer per person where it applies. A person's latest answer replaces their earlier one and the TV animates the change.
- Anything AI produced or combined is marked as such on the TV.
- A word filter screens profanity before anything reaches the TV.

**Content screens** (no input)

| Screen | TV | Phone |
| --- | --- | --- |
| Headline with depth | One headline, a number or a short statement, very large | The detail, sources, quotes and optional "read more" sections. Never an empty phone. Used for "What we heard" on the pre-call (PRE-08) |
| Scripture | The passage and its reference, quiet and typographic, still | The same passage to read, with the translation named. The facilitator pastes the passage in setup (Default). A Bible text service is Open, because many translations limit how much can be displayed |
| Prayer and silence | A dark, still screen, or a single line | "Phones away" |
| Image or document page | A photo, slide or document page at its own shape, with the room link small in a corner | The same, to zoom |
| Screen check | Edge lines, a circle and a type ladder for setting up the TV | Fixes for overscan and aspect |
| Holding and walk-in | The church's name, the event, and the texture. Optionally the day's outline | Waiting |

**INT-01 Word cloud**

- Phone: up to three words and 28 characters per answer (a session can allow one-word answers, or more words). A comma splits one send into separate answers, up to five. Up to three sends per person (Default).
- Matching without AI (Default, following Synrg): lower-cased, punctuation and emoji stripped, a trailing "s" dropped on words over three letters, and leading little words dropped ("in my finances" counts as "finances").
- TV: popularity shows in size and color. Repeated answers are anchors in large type sized by the square root of their count, from the TV minimum to headline size, never wider than about two-thirds of the screen. Single mentions are smaller chips that arrive in a gentle stream. Color steps from Sky (one mention) to Off-White (repeated) to Sunrise (the leader, with ties sharing it) on Navy. A new word shows Lime for a moment, then settles.
- Anchors glide to new positions (about 0.7 s) as sizes change, and new chips pop in (about 0.5 s). The stream keeps a steady rhythm when many arrive at once, and the oldest row of single mentions slides off when space runs out.
- AI combines near-duplicates ("youth", "young people") once there are about 30 different answers (Default), with undo from the control surface. The combination animates. Synrg never undoes a combination. The Clearway app allows undo, animated, so it never flickers.
- Anonymous by default.

**INT-02 Open text wall**

- Phone: a sentence or two (up to 280 characters, Default), several answers per person.
- TV: cards fade in where they land and the wall reflows. When there are more cards than fit, older cards shrink to the minimum size, then group or take turns, only while nothing new is arriving. Text never drops below readable size.
- Optional AI grouping drifts similar cards together under growing labels, with undo, pin and off.
- Optional AI summary beside the wall, marked as AI. It appears on the TV only after the facilitator taps Show summary, then refreshes as answers arrive (Default: after 8 new answers or 75 seconds, as Synrg does) until the facilitator hides it.
- Anonymous by default.

**INT-03 Q&A with upvotes and folding**

- Phone: ask a question anonymously (up to 200 characters, Default), and upvote others' questions.
- Ranking counts people (Default, Synrg's rule): each person who asked a folded question counts 2, each other person who voted counts 1. Ties go to the most recent activity.
- Folding: first by matching words (common words removed, about three-quarters overlap), then by AI, as questions arrive. Folded questions show "asked by 3". Every fold can be undone, and questions the facilitator has edited aren't refolded.
- TV: the top three questions with "+ 4 more on your phones", rising and falling with a glide. Spotlight puts one question large on the TV over any session. Answered clears it.
- "Questions any time" (setting) adds an Ask button to every session's phone screen, with one shared pool for the engagement.

**INT-04 Multiple choice**

- Phone: pick one, or pick any (setting). Answers can change until the session closes.
- TV: live horizontal bars, leader on top, each with "n · %". For pick any, percentages are of people answering. Royal on Navy, the leading bar in Sunrise.

**INT-05 Scale**

- Phone: 1 to 5 or 1 to 10 with labeled ends. Up to seven numbers as buttons, wider ranges as a slider.
- TV: the average large ("3.8 average of 8"), with the spread as live columns beneath. Columns rise and the average marker slides.

**INT-06 Ranking**

- Phone: tap the options in priority order. Tap again to remove, or move one up. A partial ranking counts.
- Scoring (Default, Synrg's rule): unranked options get the middle of the remaining places. The room's order is by average place.
- Add an option (setting): people can suggest a missing option. It lands on the control surface, and the facilitator adds it (merging duplicates) with one tap. It then appears on every phone's list and on the TV with a glide, and earlier rankings treat it as unranked.
- TV: live horizontal bars ordered by average place, each with its place number and "avg 2.3", gliding as averages change.

**INT-07 100 points**

- Phone: one slider or stepper per option in steps of 5, sharing a budget of 100, with the remaining points always visible. A person's points count once all 100 are placed (Default, where Synrg counts partly spent budgets). Points can move until the session closes.
- TV: live horizontal bars of each option's share of the room's points, reordering with a glide, with an optional cut line ("top five") that slides with them.

**INT-08 2x2 grid**

- Phone: name an item (or pick a listed one), then place it by tapping or dragging on two labeled axes, or with two sliders.
- TV: each item as a numbered dot at the room's average position, sized by how many placed or named it, with a legend beside the plot so labels never crowd it. Individual placements show faintly behind the average once two people have placed it. Overlapping dots ease apart. Averages glide to new positions. Duplicate items merge and the dot grows.
- Used for the pre-mortem's likelihood and impact grid.

**INT-09 Private form**

- Phone: questions answered privately.
- TV: only the count of responses. Answers never reach the TV, enforced in the database.

**INT-10 Sign together**

- Phone: the full text to read (sections expandable), then sign: a name tap by default, or a finger signature (setting).
- TV: the text's title, with names (or signatures) arriving one at a time and the count. When the wall is full it rolls slowly. The remote can hide a name and close signing. Named by design.

**Wayfinding interactions** are described in "Wayfinding sessions" (INT-11 to INT-13, INT-15, INT-16) and "Overnight review and the read-back" (INT-14).

**Mentimeter coverage.** The ten general interactions plus content screens are intended to cover what Clearway uses Mentimeter for today. Open: Chris to confirm nothing is missing (for example quizzes or a live "statements" vote, both of which Synrg has).

## Wayfinding sessions

This is the Wayfinding template's run of show, built on the shape Chris set on October 28. The sequence is Decided. The times, the interaction chosen for each session, and the wording of prompts are the template's Defaults, editable per engagement. Years assume a 2026 base year.

**Where each output lands** (Default mapping to the report order and the Clearway Map)

| Output | Lands in |
| --- | --- |
| Who took part, celebrations, discernment notes, how the room decided | The Process |
| Survey, Four Helpful Lists, board and staff input themes | What We Heard |
| Interview themes | Leadership Interviews |
| Scribe tensions, challenged outcomes | Strategic Tensions |
| Lens sentences and the confirmed read-back | The 10-year Future (Map page 1) |
| Vision Outcomes, their indicators, what we'll stop, and the success measures the team ranked | The 3-year Vision (Map page 1) |
| Pre-mortem risks and mitigations | Risks and Roadblocks (Map page 2 Key Issues) |
| 1-year goals | The 1-year Outlook (Map page 2 This Season's Goals, and CORE) |
| Commander's intent cards and first steps | Commander's Intent (and CORE) |
| Facilitator decisions and scribe decision cards | Decisions |
| Scribe actions, risks about who hears what | Communication (the communication plan) |
| Scribe questions | Key Issues (Map page 2) |

**Before the pre-call** (PRE-01 to PRE-05)

- The invite email goes out about a week before the pre-call, and people sign in.
- Whether the new process also asks pre-work questions on phones before the pre-call is Open. If it does, they run as self-paced sessions (for example a celebration question seeding the pre-call celebrations, and a success-measures question seeding the metrics ranking), reached from the invite email.

**Pre-call: 90 minutes on video, one to two weeks before.** The facilitator shares the TV view in the call and runs everything from the control surface.

| Session | Interaction | TV view (shared) | Phones | Lands in | Screens |
| --- | --- | --- | --- | --- | --- |
| Welcome and prayer | Scripture, then join | Scripture and the join link | Join and sign in, staying signed in for the retreat | The Process | PRE-06 |
| Celebrations | Word cloud (INT-01), then open text wall (INT-02) | One-word cloud, then a wall of what God is doing worth celebrating | One word, then a sentence | The Process | PRE-06 |
| Metrics | Ranking (INT-06) with add an option | The room's ranked success measures as live bars | Rank the measures, suggest missing ones | The 3-year Vision | PRE-07 |
| What we heard | Headline with depth, then Q&A (INT-03) | Survey, Four Helpful Lists, board and interview headlines, one at a time | The detail under each headline, and anonymous questions that fold and rise by votes | What We Heard, Leadership Interviews | PRE-08, PRE-09 |
| Seed the Five Lenses | Lens seeding (INT-12), self-paced | The Five Lenses and how the retreat will use them | Each person starts writing 2036 sentences per lens. Seeding opens now and stays open on phones until Day 1. Sentences are hidden until each lens opens | The 10-year Future | PRE-10 |

- The metrics options are curated before the call: the facilitator turns any pre-work or Discover input about success measures into ranking options in setup (Default), and the room can suggest more during the call.
- The call is recorded in the video tool. The facilitator adds the recording link to the engagement, and anyone who missed the call watches it and seeds their sentences afterward (PRE-11).

**Day 1: celebrate and dream** (template times, Default)

| Time | Session | Interaction | TV | Phones | Scribe | AI | Lands in | Screens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9:00 | Welcome and prayer | Join, then Scripture | Join screen with names arriving, then Scripture | Scan the QR code | Who is in the room | None | The Process | D1-01, D1-02 |
| 9:15 | Celebration, short (about 20 minutes) | Word cloud (INT-01) or the pre-call celebration wall reopened | One-word cloud | One word | Quotes worth keeping | None | The Process | D1-03, D1-04 |
| 9:35 | Five Lenses: Congregation | Lens wall (INT-12) | "It's 2036. Describe our Congregation." Seeded sentences first, then new ones | Write in the present tense | Quotes, decisions, tensions, easel photos | Clusters similar sentences | The 10-year Future | D1-05, D1-06 |
| 10:30 | Break | Nothing live |  |  |  |  |  |  |
| 10:45 | Five Lenses: Community | Lens wall | As above | As above | As above | As above | The 10-year Future | D1-05, D1-06 |
| 11:45 | Lunch | Nothing live |  |  |  |  |  |  |
| 12:30 | Five Lenses: Leadership, Operations, Learning | Lens wall | As above. Learning asks "It's 2036. What will we know then that we don't know now?" | As above | As above | As above | The 10-year Future | D1-05, D1-06 |
| 2:30 | Break | Nothing live |  |  |  |  |  |  |
| 2:45 | Provisional Vision Outcomes | Cluster and rename (INT-13), then 100 points (INT-07) | Candidate priorities from all Five Lenses, then live bars with a cut line | Rename and merge, then spend 100 points | The provisional list and who argued what | Proposes 6 to 10 candidates | The 3-year Vision | D1-07 to D1-10 |
| 3:45 | 3-year Vision, first pass | Outcome bullets | One outcome at a time, bullets filling in | "In 2029, what's true?" | Numbers, dates, names | None (the empty-outcome flag is code) | The 3-year Vision | D1-11, D1-12 |
| 4:15 | Close | Scripture | The provisional outcomes, then Scripture, with the invitation to pray over them overnight | Phones away |  |  |  | D1-13 |

**How each lens runs**

1. The TV sets the scene: "It's 2036. Describe our Congregation."
2. The sentences each person seeded since the pre-call appear first, so the room starts with everyone's perspective.
3. For 3 to 5 minutes, everyone adds sentences on their phone in the present tense.
4. Phones go down. Chris draws out the conversation from the wall and builds on the easel.
5. The scribe tags quotes, decisions and tensions and photographs the easel page, which attaches to the lens.

**Overnight: draft, review, publish** (OVN-01 to OVN-03, see "Overnight review and the read-back")

**Day 2: confirm, stress-test, define, hand over** (template times, Default)

| Time | Session | Interaction | TV | Phones | Scribe | AI | Lands in | Screens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8:30 | Prayer and listening | Prayer, then open text | Scripture, then dark. Then "What are we sensing?" | Phones away, then one prompt | What the team shares | None | The Process | D2-01, D2-02 |
| 9:00 | Read-back | Read-back (INT-14) | Each lens of the overnight draft with a live tally | "Yes, that's us" or "It needs a change", and what's missing | Corrections and their reasons | Folds agreed corrections into the draft | The 10-year Future | D2-03, D2-04 |
| 9:30 | Confirm the Vision Outcomes | Outcome confirm | The provisional list with confirm, rename and challenge counts | Confirm, rename or challenge each, with a reason | The consensus decision and why | None | The 3-year Vision, Decisions | D2-05, D2-06 |
| 10:00 | Pre-mortem | 2x2 grid (INT-08) | "It's 2029 and this plan failed. Why?" Reasons as dots on likelihood and impact | Name a reason, then place it | Mitigations the team names | Merges duplicate reasons | Risks and Roadblocks | D2-07, D2-08 |
| 10:30 | Break | Nothing live |  |  |  |  |  |  |
| 10:45 | 1-year Outlook | CORE goal builder (INT-15) | One outcome at a time: 3-year Vision left, goals right, each tagged with the risk it answers | Propose a goal with a title, result, owner and end date | Decisions, owners, dates | None (CORE checks are code) | The 1-year Outlook, CORE goals | D2-09, D2-10 |
| 12:15 | Lunch | Nothing live |  |  |  |  |  |  |
| 1:00 | The team takes the remote | Hand over (FAC-03) |  | The team facilitator's phone becomes the remote | No scribe from here |  |  | D2-11 |
| 1:10 | Commander's intent | Commander's intent card (INT-16), team-led | Every card filling in at once | Pairs or trios draft one card per Vision Outcome, then present |  | Flags first steps missing an owner or date (code) | Commander's Intent, CORE | D2-12, D2-13 |
| 2:30 | Affirm together | Sign together (INT-10), team-led | Names gathering beneath the cards | Affirm the full set |  |  | Commander's Intent | D2-14 |
| 2:45 | Recap | Draft Clearway Map | The draft Map assembled from the two days | Read along |  |  | Clearway Map | D2-15 |
| 3:10 | Publish and close | Publish to CORE, then Scripture and prayer | "Published", then Scripture |  |  |  | CORE | COR-01 to COR-03 |

**Day-and-a-half template** (Default split, since Chris decided only that a self-facilitated follow-up session is available)

- The half day ends after confirming the Vision Outcomes and the 1-year Outlook, with a short close and a draft Map showing what's ready.
- The pre-mortem and commander's intent move to the follow-up session, run by a team facilitator with the remote, on video or in person (Open).
- Goals built before the pre-mortem don't need a linked risk. After the follow-up session, the team tags each goal with the risks it answers.
- Vision Outcomes and goals can be published to CORE at the end of the half day. Commander's intent first steps publish after the follow-up session as a second, additive publish.

**Wayfinding interactions**

**INT-11 Four Helpful Lists** (Discover, milestone 6)

- Phone: add cards to any of the four columns (What's right? What's wrong? What's missing? What's confused?), and tap to agree with others' cards.
- TV: four columns filling as cards arrive, similar cards sliding together, agreement counts ticking up on each card.
- Lands in What We Heard and Strategic Tensions.

**INT-12 Lens wall and lens seeding** (milestone 4)

- Seeding: a self-paced session that opens during the pre-call and stays open until Day 1. People write sentences for each lens. They're hidden from everyone, including the control surface, until the lens opens (Default. Showing them to the facilitator beforehand is Open).
- Live: present-tense sentences, several per person, with a gentle present-tense reminder on the phone.
- TV: seeded sentences appear first, then new ones fade in and the wall reflows. Similar sentences lean together into clusters under growing labels while people are still typing.

**INT-13 Cluster and rename** (milestone 4)

- AI proposes 6 to 10 candidate priorities from all Five Lenses, each with the sentences it came from. They land on the control surface first, and go to the TV when the facilitator sends them.
- Phones: rename or merge candidates, or suggest a new one. Suggestions land on the control surface, and the facilitator accepts each with one tap. Accepted changes show on the TV as they're made.
- Then 100 points (INT-07) across the candidates. Bars with a cut line, which the facilitator sets between four and six.
- The facilitator marks the provisional Vision Outcomes. They stay provisional until confirmed on Day 2.

**Outcome bullets** (milestone 4)

- One Vision Outcome at a time: "In 2029, what's true?" Bullets fill in under the heading as people type.
- An outcome with no bullets shows as empty, outlined in Sunrise, until it has at least one (code, not AI).
- Bullets are the outcome's success indicators and publish to CORE as indicators.

**Outcome confirm** (milestone 4)

- Phones: confirm, rename or challenge each provisional outcome, with an optional reason.
- TV: the counts per outcome. A challenged outcome lifts to the top of the control surface and gets a soft highlight on the TV until decided.
- The facilitator records the room's consensus decision and its reasons. Counts never decide. Renames suggested here are accepted by the facilitator, as in INT-13.
- Each outcome gets a one-line description (drafted by the facilitator from the room's words, Default), which publishes to CORE.

**INT-15 CORE goal builder** (milestone 4)

- TV: one Vision Outcome at a time, its 3-year Vision bullets on the left and its 1-year goals on the right. Each goal shows the risk it answers and its four CORE letters.
- Phones: propose a goal with a short title, the result, one owner, an end date (defaulting to a season end) and the pre-mortem risk it answers.
- The owner is chosen from the attendee list or added by name and email (Default), since 1-year goals are often owned by staff who aren't in the room. An owner added this way becomes a CORE invitation at publishing.
- Each CORE letter shows met or missing, checked in code: Connected (linked to this outcome), Owned (exactly one person), Result (a result is written, and the facilitator confirms it's clear), End date (a date is set). A goal with a missing letter is outlined in Sunrise with what's missing ("Needs an owner") until fixed, and turns solid when all four are met.
- The facilitator can edit any goal from the control surface.

**INT-16 Commander's intent card** (milestone 4)

| Field | The question |
| --- | --- |
| Commander's intent | What must be true by 2029, even if every plan changes? |
| The must-do | What is the one thing we cannot fail to do? |
| What we'll stop | What are we giving up to make room for this? |
| Next 30 days | What happens first, who owns it, and by when? One or more steps, each with one owner and a date |

- Assignment (Default): the team facilitator assigns pairs or trios to Vision Outcomes from the remote, or lets people pick on their phones. With about 8 people and four to six outcomes, every outcome has someone drafting it.
- Editing (Default): each field is locked to one phone while someone is typing in it, and released after a few seconds idle. Others see who's editing (first names, within the pair). The TV shows each field as it's typed.
- Step owners come from the attendee list or are added by name and email, as for goals.
- A step without an owner or a date shows in the Sunrise outline until fixed (code).
- The card stays at the level of intent. The year's goals live in the 1-year Outlook.
- Pairs present. Edits made during the presentation replace old lines on the TV as they're typed.

**This Year's Priorities.** The Clearway Map's page 2 needs three to five Annual Initiators. Whether the retreat names them (a short session after the 1-year Outlook) or they wait for the church's Annual Planning is Open. Until then, the draft Map shows that field empty.

## Scribe capture

The scribe captures what the easel can't hold, as tagged cards that become structured data for the read-back and the report. Chris asked for a scribe capturing notes and quotes, taking photos and uploading documents. (Milestone 5.)

| Card | Used for | Lands in |
| --- | --- | --- |
| Quote | Words worth keeping verbatim, with an optional speaker for the record | The lens or section's pull quote, the report |
| Decision | What the room decided by consensus, and why | Decisions |
| Tension | A disagreement, with both views | Strategic Tensions |
| Action | Something someone will do, with an owner and date if named | Communication, next steps |
| Question | Something unresolved | Key Issues |
| Mitigation | What the team would do about a pre-mortem risk | Risks and Roadblocks, linked to the risk |
| Photo | An easel page or wall, taken on the scribe's phone | Attached to the session, read by the overnight draft |
| File | A document, slide or handout uploaded to the session | Attached to the session |

- Cards attach to whatever session is live, with the time. The scribe can re-file or edit a card.
- Speaker names are stored for the record and never shown on the TV or to participants.
- The control surface shows cards arriving, and the facilitator can promote a quote to the TV, anonymously (Default).
- The console works offline and syncs in order with no duplicates.
- Easel photos are read by the overnight draft (Claude reads images), so the easel's content informs the read-back.

## AI

Claude does the AI work. It speeds the room up and never stands in its way.

| Job | When | Works from | Produces | Reaches the TV how | Milestone |
| --- | --- | --- | --- | --- | --- |
| Fold near-duplicate words and questions | Live | Answers as they arrive | Merges | Directly, marked as AI, with undo | 3 |
| Cluster sentences and celebrations | Live | Answers as they arrive | Groups with short labels | Directly, labels marked as AI, with rename, undo, pin and off | 3, 4 |
| Merge duplicate pre-mortem reasons | Live | Reasons as they arrive | Merged dots | Directly, with undo | 4 |
| Summarize an open text wall | Live, on request | The wall's answers | A short read of the room | Only after the facilitator taps Show summary | 3 |
| Propose candidate priorities | Live, on request | All Five Lenses | 6 to 10 candidates with their sources | Control surface first, then the facilitator sends them | 4 |
| Discover themes | As input arrives | Survey answers, Four Helpful Lists cards, interview and input-conversation notes | Themes with counts and sources | Never directly. The facilitator accepts each theme | 6 |
| Alignment signal | Live | Accepted Discover themes and the session's input | Private signal cards | Never | 6 |
| Overnight drafts | Overnight | Lens input, scribe cards, easel photos | Present-tense paragraphs per lens with source links, tidied outcomes, flags | After review and publishing | 5 |
| Fold read-back corrections | Live, Day 2 | Agreed corrections | Tracked changes | After the facilitator accepts each | 5 |
| Report draft | After | The whole engagement record | Draft in Clearway's report order, with sources | Never (it's a document) | 7 |
| Communication plan | After | Risks, key leaders, donors and actions named in the room | Draft plan | Never | 7 |

**Rules**

- AI is never in the path from phone to TV. If AI is slow or down, the room keeps working and the wall shows input in arrival order.
- Nothing AI writes reaches the TV or phones without a facilitator's review or action, except the live work the room already sees rearranged: merges, cluster labels and merged dots. These are marked as AI and can always be undone, renamed, pinned or switched off, per session and per engagement.
- Checks that follow a rule are code, not AI: the CORE letters on goals, empty-outcome flags, first steps missing an owner or date, the 100-point total, thin-data thresholds.
- Drafts use the room's own words wherever possible. Every drafted sentence links to the input it came from, and the facilitator can swap AI wording for the room's exact words in one action.
- A summary is a new statement nobody in the room made, so summaries are always marked as AI on screen and in drafts, with the room's own words one tap away.
- AI never receives attendee identity fields (names, emails, roles). Scribe speaker names and goal owners are added back by code afterward. Free text and photos are sent as written (Default). A redaction step for names inside free text is Open.
- Merge limits (Default, following Synrg's consolidate rules): AI never merges different kinds of input, never merges quotes, never drops a number, never merges more than four items into one in a single step, and always leaves at least 60 percent of items standing.
- Every AI output stores the model, the prompt version and its inputs.
- Prompts live in the repository, use Clearway's terms exactly (see "Words in the app"), and are tested against fixtures.
- AI use is disclosed to churches before anyone submits input (wording and placement Open).

**Models and cost** (Default): a fast Claude model for live folding and clustering, where speed matters, and the most capable Claude model for overnight drafts, the report and the signal. Model names live in configuration, not code. AI cost per engagement is logged.

**Testing AI** (Default): Codex builds a fixture set from an anonymized past engagement (lens sentences, scribe notes, a survey export) and the fictional Riverside engagement. Each prompt has expected-behaviour tests (folds what should fold, never invents content, keeps present tense, never names people) that run on every change.

## Overnight review and the read-back

Milestone 5. Nothing reaches the room until Chris and the co-facilitator have reviewed it.

1. When Day 1 closes, AI drafts the 10-year Future for each lens in the present tense from phone input, scribe cards and easel photos, every sentence linked to its sources. It tidies the provisional Vision Outcomes and the first-pass 3-year Vision, and flags any thin outcome (OVN-01). Like Synrg's "morning mirror", it keeps the voices not to lose (a strong line from one person) and the tensions the room named separate, so they aren't smoothed away.
2. Chris and the co-facilitator review and edit side by side. A section one person is editing is locked for the other. Sources show beside each sentence (OVN-02).
3. Chris publishes the read-back for the morning (OVN-03).
4. On Day 2 the room confirms or corrects each lens (INT-14). The final 10-year Future is the corrected draft.

- Drafts are ready within 30 minutes of Day 1 closing (Default).
- Review takes about 45 minutes.
- Every version of every draft is kept.

**INT-14 Read-back** (milestone 5)

- TV: one lens of the published draft at a time, "Community, 2036" and the paragraph, with a live tally.
- Phones: the full draft with the team's source sentences underneath, then "Yes, that's us" or "It needs a change", and "What's missing?"
- Corrections the room agrees fold into the draft as tracked changes once the facilitator accepts them, with the scribe's reason.
- Like Synrg's mirror, it closes by asking "Did we hear you right?" and "What's missing?"

## Discover

Milestone 6. Everything from Discover lives in the engagement record and is available in the room.

**Congregational survey** (SET-04, SET-10)

- Team Hub already has a survey builder, with surveys and responses linked to engagements. Whether the app reads those or builds its own is Open. Either way the app holds the results and themes for the engagement. Team Hub's responses can carry an email, which affects anonymity if that builder is chosen.
- Question types: multiple choice, scale, ranking, open text, and demographics for segments (age band, years at the church, role).
- An open link with no sign-in. A light duplicate check (a device id and a hashed network address) only flags possible duplicates for the facilitator and never blocks an answer, since a whole congregation can share church wifi.
- A live response count on the control surface, and a CSV import for surveys run elsewhere.
- AI themes open-text answers as they arrive, with counts and example quotes, no names. The facilitator accepts, renames, merges or rejects each theme. Only accepted themes reach What We Heard and the signal.
- Segment breakdowns are hidden for segments under 5 respondents (Default), so small groups can't be identified.

**The Four Helpful Lists** (SET-05, INT-11): run live on the TV and phones as a session in the engagement, usually with the board or team.

**Leadership interviews and input conversations** (SET-06)

- The facilitator uploads notes or transcripts from leadership interviews and from board and staff input conversations (paste, Word, PDF or text, Granola transcripts as an option, Open).
- AI drafts themes across them with no names attached, showing how many conversations each rests on ("4 of 5"). The facilitator edits and accepts.

**Thin data** (Default rule): a theme or segment is flagged as thin when it rests on fewer than 10 responses or under 10 percent of respondents, or on one interview. Thin themes are marked wherever they appear.

**What We Heard** is assembled from accepted survey themes, Four Helpful Lists cards, and interview and conversation themes, as headlines with depth for the pre-call (PRE-08) and as the report section.

## The alignment signal

Milestone 6. Facilitator's private view only (FAC-02), and the short list on the facilitator's own remote. Never on the TV or any participant's phone.

| Signal | Meaning | Example card |
| --- | --- | --- |
| Aligned | The room echoes a strong Discover theme | "Aligned: welcoming culture. Strong in the survey, 3 sentences today." |
| Divergent | The room is heading somewhere Discover doesn't support | "Divergent: the room leans toward a third service. The survey names connection beyond Sunday." |
| Silent | A strong Discover theme nobody has raised | "Silent: small group access. Strong in the survey and 4 of 5 interviews. Not yet raised today." |
| Thin data | A theme the room leans on that rests on too few responses | "Thin data: under-30s are 6 of 87 respondents." |

- Signals are suggestions for the facilitator, never corrections of the room. In Chris's words, not striking out bad ideas, but noticing the discussion going a different direction.
- Each card shows its evidence: the theme, its strength and sources, and the room's input that triggered it.
- The facilitator can dismiss a card, save an aligned card as a citation for the report, or put a neutral question on the TV that carries no data and doesn't name the signal.
- Silent signals appear only after phones first go down in a session (Default).

## Outputs

Milestone 7, except the draft Clearway Map (milestone 4).

**Draft Clearway Map** (D2-15): assembled at the close of Day 2.

- Page 1: Mission, Purpose, Values and Strategy from the church record (entered in setup, since CORE doesn't hold them), the 10-year Future, the 3-year Vision Outcomes.
- Page 2: This Year's Priorities (empty unless the retreat names them, see Open questions), This Season's Goals (1-year goals ending this season), Leadership Rhythms (from the church record), Key Issues (scribe questions and open tensions).
- Empty fields show as empty, never invented.

**Publish to CORE** (COR-01 to COR-03): see Integrations.

- The readiness check (COR-01) lists every goal and first step with its gaps, like a commitments register: nothing publishes without a title, an agreed result, one named owner and an end date. Vision Outcomes need a title and at least one indicator.
- If publishing fails in the room, the TV stays on the Day 2 recap, the remote shows "Not published yet" with the reason, and the facilitator can retry or publish later from setup. Nothing partial is left in CORE.

**Report draft** (AFT-01)

- AI assembles the full report in Clearway's order from the engagement record: survey and interview themes, the Five Lenses in the team's words, scribe decisions and tensions, the pre-mortem grid, the 1-year Outlook and the commander's intent cards.
- Every paragraph keeps its sources in the app. Quotes are verbatim. Names appear only where someone owns a step or agreed to be quoted. Thin data is labeled.
- Chris edits, adds his own read of the team, and signs off.
- Export as a Clearway-branded Word document following Clearway's document standard, and as PDF.

**Communication plan** (AFT-02): drafted from what the room said about key leaders, major donors and the risk of anyone hearing the plan from the stage first. Rows: who, when, who tells them, what they hear, the risk it answers. Chris reviews it with the church on a follow-up call within two weeks.

**Read-only copy** (AFT-03): available once the plan is published to CORE (Default). It shows the Clearway Map, the Vision Outcomes with their indicators, the 1-year goals with owners, dates and their CORE status, and the commander's intent cards. It's a link the facilitator creates and can revoke, and never shows raw answers, scribe cards or drafts. The report is added once Chris signs it off.

**Check-ins** (AFT-04, AFT-05): at 30, 60 and 90 days, each participant gets an email with a link to a short self-paced pulse about their own first steps and goals: done, under way, stuck, and a note. Goal status is read back from CORE. The facilitator sees results and follow-ups.

**Results recap** (Default): a facilitator page with one card per session (type, prompt, count, results as they appeared), which updates without re-animating, prints to PDF, and downloads as CSV.

**Exports** (Default): every session's input as CSV, the report as Word and PDF, the draft Map as PDF, and the full engagement as a JSON archive. Exports with authorship are facilitator-only.

## Architecture

**Decided:** its own repository, domain and database. The stack matches CORE as closely as possible. It reads from Team Hub, and writes to and reads from CORE through deliberate connections. The live room is kept separate from the setup side, as Synrg does, so a session keeps running if anything else fails.

&#91;embedded content: Architecture · the app, its database, three connections\]

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js (App Router), TypeScript | CORE runs Next.js on Vercel |
| Runtime | Node 22.x | CORE's setting |
| Hosting | Vercel, in Clearway's existing team, at live.clearway.co, with clearway.co/live redirecting to it (Decided) | Where CORE and Team Hub run |
| Database | A new Supabase project (Postgres 17) | CORE and Team Hub each have their own |
| Room sign-in | Supabase Auth: email code and tap-to-confirm link | The access model |
| Facilitator sign-in | Google sign-in through Supabase Auth, limited to Clearway accounts (Decided) | The access model |
| Realtime | Supabase Realtime (broadcast channels per engagement), proven by the milestone 2 test | Same platform as the database |
| Files | Supabase Storage for easel photos, uploads and exports | Same platform |
| Email | Resend | CORE sends its invitations through Resend |
| AI | Claude, through Anthropic's API, called only from the server | The brief |
| Motion | A layout-animation approach (FLIP or a library such as Motion), Codex's choice | The screen is alive |
| Versions and conventions | Codex copies CORE's package versions, linting, folder layout and styling approach from CORE's repository | Match CORE as closely as possible |

**Parts inside the one repository**

| Part | Routes | Notes |
| --- | --- | --- |
| Room | Phone pages, the TV page, the remote | Small, fast, works offline, no setup-side code loaded |
| Control and setup | The control surface, setup, overnight review, outputs | Clearway sign-in only |
| Public | Survey pages, the read-only copy | No sign-in |
| Server | Submission endpoint, realtime broadcast, AI jobs, integrations, scheduled jobs (self-paced opening and closing, check-ins, nightly practice-room reset) | Secrets stay on the server |

**Keys and secrets**: the Supabase service key, the Anthropic key, the Resend key and the Team Hub and CORE connection credentials live only in Vercel environment variables and are never sent to a browser.

## Integrations

**Read from Team Hub** (milestone 1). Team Hub is a separate Supabase project. Table names below are Team Hub's as of October 29.

| Team Hub | Used for |
| --- | --- |
| clients | Creating the church: name, time zone, logo, address (SET-01) |
| engagements, engagement\_elements | Linking the app's engagement to the one Clearway already tracks, and reading planned dates for the pre-call and retreat |
| events (engagement\_id) | Reading scheduled session dates where they exist |
| people, person\_emails, person\_organizations | Building the attendee list from the church's people (SET-03) |
| team\_members | Clearway's facilitators and co-facilitators (name and email only) |
| surveys, survey\_responses | Reading Discover survey results, if Chris chooses Team Hub's survey builder (Open) |

- The app stores each linked record's Team Hub id. It reads on demand and on a refresh button, and never writes to Team Hub (Default).
- The connection exposes only the columns the app needs. Team Hub tables hold sensitive columns (for example calendar tokens on team\_members) that the app must never be able to read.
- The app reads Team Hub through Supabase, from its server only (Decided October 29). Default: a read-only database role on Team Hub with views that expose only the columns the app needs, which Codex adds in Team Hub's repository with Chris's approval.

**Write to CORE** (milestone 7). CORE is a separate Supabase project. Table names, required columns and allowed values below are CORE's as of October 29.

| From the app | CORE table | Fields |
| --- | --- | --- |
| Church | organizations | Matched by the CORE organization id stored on the church. The id is empty until the church is linked. Who creates a CORE organization for a church that isn't in CORE yet is Open |
| Vision Outcome | vision\_outcomes | title (required), description (the outcome's one-line description), indicators (the 3-year Vision bullets), display\_order, organization\_id, status set explicitly (Open: CORE defaults to ON\_TRACK, which shows Green on a brand-new outcome), source\_type set to a new value marking it as from the app |
| 1-year goal | goals | title (required), description (the result), owner\_id, due\_date (the end date), season (required: SEP\_DEC, JAN\_APR or MAY\_AUG, from the end date), vision\_outcome\_id, organization\_id, status NOT\_STARTED |
| Owner without a CORE account | invitations, through CORE's own invite flow | CORE's invite flow creates the token and sends the email. requested\_role is MEMBER, ADMIN or OWNER (Default MEMBER) |
| 30-day first step | Open | Options: tasks (title, goal\_id, assignee\_id, due\_date), a goal of its own, or a project task |
| Goals in the 3x3 Vision Matrix | Open | Option: vision\_matrix\_items with item\_type GOAL, goal\_id, year 1, and the season mapped to CORE's SEASON\_1, SEASON\_2 or SEASON\_3 for that organization. created\_by must be a CORE user |

- **One transaction.** Publishing runs as a single CORE-side operation (an API endpoint or database function in CORE) that creates every record or none. Invitations are sent only after it commits. This needs a small addition to CORE, which Codex builds in CORE's repository with Chris's approval.
- **Additive.** Publishing adds records and never overwrites existing ones. Before publishing, the facilitator sees anything that may overlap (an outcome with the same title already in CORE) and chooses to add, link or skip.
- **Re-publishing.** Later changes (after a day-and-a-half follow-up session, or corrections after the retreat) publish as additional records linked to what's already there. The app remembers every CORE id it created, so it never duplicates.
- **Owners.** Matched to CORE users by email. Anyone without a CORE account gets a CORE invitation. How their goals are held until they accept is Open.
- **Seats.** CORE organizations have plan and seat limits (the Free plan has one seat). How invitations for about 8 owners fit a church's plan is Open.

**Read from CORE** (milestone 7): goals.status (NOT\_STARTED, ON\_TRACK, AT\_RISK, OFF\_TRACK, COMPLETED) for check-ins and the read-only copy. On track shows as Green, at risk as Yellow, off track as Red, and completed as completed (never Green).

## Data model

Everything hangs off the engagement. These are the entities the screens need. Codex sets the exact columns, keys, indexes and policies, keeps every table under row-level security, and adds created and updated times and soft deletes throughout.

**Setup**

| Entity | Holds | Links to |
| --- | --- | --- |
| Church | Name, time zone, logo, Mission, Purpose, Values, Strategy, Leadership Rhythms, governance body's name | Team Hub client id, CORE organization id (empty until linked) |
| Engagement | Type, status, dates, base year, lens names, AI on or off, Scripture translation, TV theme, texture and room size | Church, Team Hub engagement id |
| Clearway user | Name, email, admin flag | Team Hub team member id |
| Engagement facilitator | Lead or co-facilitator | Engagement, Clearway user |
| Attendee | Name, email, room role (participant or scribe), role at the church, verified time | Engagement, Team Hub person id |
| Join request | Email, name, device, requested time, approved or declined, by whom | Engagement |
| Device session | A signed-in phone or laptop, valid until the engagement closes | Attendee |
| Template | A saved run of show | Clearway user |
| Session | Part, order, title, planned start and length, mode (live or self-paced, with open and close times), interaction, prompt, phone depth, settings, presenter notes, team-led flag, lands in, state | Engagement |

**The live room**

| Entity | Holds | Links to |
| --- | --- | --- |
| Room state | Live session, TV content, phones down, burst end, spotlight, hidden items, remote holder and team-led block, TV view on phones, version | Engagement (one row) |
| TV pairing | Pairing code, paired time, last seen | Engagement |
| Submission | The answer (text, choice, scale value, ranking, point allocation, grid position), client-made id, queued, sent and received times, changed or withdrawn flags, hidden flag, test flag | Session, attendee |
| Question vote | Upvotes on Q&A | Submission, attendee |
| Option suggestion | A suggested ranking option or rename, accepted or merged | Session |
| Cluster | Label, members, pinned flag, AI version | Session, submissions |
| Merge | What AI or the facilitator merged, and undo | Session |
| Decision | What the room decided by consensus, and the reasons | Session |
| Affirmation | Who affirmed or signed, and when | Session, attendee |
| Latency log | Phone sent, server received, TV received, per submission | Submission |

**Capture and Discover**

| Entity | Holds | Links to |
| --- | --- | --- |
| Scribe card | Kind, text, speaker (record only), owner and date for actions, time | Session, risk (for mitigations) |
| Photo and file | Storage path, kind, time | Session |
| Survey and response | Questions, answers, segments, device id, duplicate flag | Engagement (or a Team Hub survey id) |
| Conversation note | Uploaded interview or input-conversation notes, kind, person (record only) | Engagement |
| Discover theme | Source, label, count, strength, example quotes, thin flag, accepted flag | Engagement, its sources |
| Signal | Kind, theme, evidence, dismissed and saved flags | Session, theme |
| Recording link | The pre-call recording | Engagement |

**Wayfinding outputs**

| Entity | Holds | Links to |
| --- | --- | --- |
| Lens sentence | Text, lens, seeded or live | Session, attendee |
| Draft | Section, text, source links, status, reviewer, version | Engagement, its sources |
| Read-back response | Agree or change, correction, what's missing | Draft, attendee |
| Vision Outcome | Title, description, provisional or confirmed, indicators (3-year Vision bullets), what we'll stop, order | Engagement |
| Risk | Text, likelihood, impact, merged into | Engagement |
| Goal | Title, result, owner (an attendee, or a name and email), end date, season, the risks it answers, CORE check state | Vision Outcome |
| Intent card | Commander's intent, the must-do, what we'll stop, assigned people | Vision Outcome |
| First step | Text, owner (an attendee, or a name and email), date | Intent card |
| Key metric | A success measure the team ranked | Engagement |
| Celebration | Text and theme | Engagement |
| Annual Initiator | One of three to five priorities for the year, if the retreat names them (Open) | Engagement |
| Clearway Map draft | The assembled two pages | Engagement |
| Report draft | Sections, text, sources, sign-off | Engagement |
| Communication plan | Rows: who, when, who tells them, message, risk | Engagement |
| CORE publish | When, by whom, each CORE id created, result | Engagement |
| Check-in | 30, 60 or 90-day pulse answers | Engagement, attendee |
| Read-only link | Token, created by, revoked flag | Engagement |
| AI run | Job, model, prompt version, inputs, output, cost, time | Whatever it produced |

## Design system

Claude Design builds the app's design system before the first high-fidelity screens. It starts from the existing Clearway design system and adds what a live room needs: screens read from across a room, input that moves while people watch, and private views that must never be mistaken for the shared screen. The wireframes are deliberately unbranded (Inter and grays), so the design system is where the app first takes on Clearway's look.

**Two layers**

- **Clearway base.** The Clearway Design System (https://claude.ai/artifact/HWe33WYnnbNRusJmQ8LZTA, moved from Claude Design to an artifact on October 29), Clearway's default: colors, Plus Jakarta Sans, radii, navy-tinted shadows, motion, patterns, logos, icons and web components, built from the brand guidelines and the clearway.co codebase. The live app starts from it rather than rebuilding it. Clearway also has a CORE Design System (https://claude.ai/artifact/LaUMw4AjHUmXLNVHsNKC2f) with ready-made app components. It is a reference for app patterns only. Clearway Live is used on every surface, so the whole app feels like one product (Decided October 29).
- **Live app layer.** Built on the base for this app. It adds tokens and components and leaves the brand values unchanged. When the Clearway Design System changes, the app layer follows. Built October 29 as the Clearway Live design system (https://claude.ai/artifact/TviB5WSyPHa1tSBCdTE8Pf), covering the TV and phone screens first and being extended to the control surface, setup, scribe console and overnight review: color roles, TV and phone type ramps, motion tokens and prototypes, texture options, lens and group colors, facilitator-only tokens, and the core live components. Its live\_tokens.css is the token file Codex builds from.

**Tokens.** Every token has a semantic name (surface, text, accent, live, callout, signal-divergent and so on) mapped to a base value, so components never use a hex value directly.

| Area | Starts from in Clearway | What the live app adds |
| --- | --- | --- |
| Color | Navy, Royal Blue, Sky Blue, Lime, Soft Lime and Off-White, a 10-step gray scale, and semantic Success, Warning, Error and Info | A brighter, Royal-led palette for the live surfaces, roles for each surface, a deeper Royal for small text on blue, a group palette, five fixed lens colors, facilitator-only signal colors, and Sunrise, a live-only color for callouts |
| Type | Plus Jakarta Sans, weights 300 to 700, 16 px body at 1.6 line height | A scale for each surface, with TV minimums for anything the room must read |
| Spacing and layout | A 4 px grid (tokens 1 to 24), radii 6, 12 and 16 px and pill | A spacing scale, the TV's 16:9 grid at 1920 by 1080 with safe margins, phone layouts from 360 px wide, laptop layouts for the facilitator view and scribe console |
| Motion | Hover 200 ms, menus 500 ms on the signature easing cubic-bezier(0.25, 0.1, 0.25, 1), scroll reveal 800 ms, no bounces | Durations, easing and delay rules for arrival, reflow, swell, regroup, bar reorder and the cut line, each with a reduced-motion equivalent |
| Elevation | Navy-based shadows | Little or no shadow on the TV so it reads cleanly at a distance |

**Surfaces**

| Surface | Requirements |
| --- | --- |
| TV | Room-readable text at least 36 px at 1080p, main content 44 to 56 px, headlines 64 px and up. These are starting values, confirmed from the farthest seat in the practice room. They line up with Synrg's type floor (a target of about 5% of screen height, a hard minimum of about 3.4%). All TV type scales together with the room size setting. If a screen can't hold the minimum, the whole type ramp shrinks evenly down to it. Past that, words move to the phones rather than shrink further. Text keeps a safe margin of about 1.5% from every edge. High contrast, little chrome, one focal area per screen. The join screen shows a large QR code and a short link. The Clearway logo sits small in one corner. Quiet states for Reconnecting, Nothing live and phones down |
| Phone | One-handed use, touch targets at least 44 px, large inputs that stay above the keyboard, from 360 px wide. Clear states for sent, saved on this phone, phones down, anonymous and named |
| Facilitator view | Dense and scannable. Everything private carries one consistent "only you see this" treatment |
| Remote | Large controls. Always shows what the TV has confirmed |
| Scribe console | Keyboard-first tagging and one-tap photos |

**Color** (Decided October 29)

| Color | Job in the live app |
| --- | --- |
| Royal Blue (#3F72DE) | The main live brand color: headers, primary buttons, bars, highlighted panels, large color blocks |
| Navy (#03294E) | Every dark screen background, and text on light cards |
| Lime (#D2FF71) | Live, confirm and active: the LIVE marker, the current session, confirm buttons, confirmed items, the newest arrival, progress |
| Sunrise (#FFC845) | Callouts and attention: an item the facilitator spotlights, a key number, the leading answer, something that needs fixing on the TV |
| Sky Blue, Soft Lime, Off-White | Cards and groups on the wall, so input reads as color |
| Warning (#D97706) and Error (#DC2626) | Real problems only, on the facilitator and scribe views |

- Lime always means live, confirmed or active. Sunrise always means "look here." Each gets at most one moment per screen, they never sit side by side, and neither appears in the group palette.
- On Navy: Off-White (14.3 to 1), Lime (12.8 to 1) and Sunrise (9.5 to 1) pass as text at any size. Royal on Navy is 3.3 to 1: fine for bars, panels and large shapes. Royal text on Navy is large text only.
- On Royal: Off-White is 4.4 to 1, which passes for large text only. A deeper Royal (#3868D4, 5.0 to 1 with Off-White) is the token for small text on blue. Navy text sits on light cards.
- On light backgrounds, Lime and Sunrise appear as filled blocks with Navy text, never as text or thin lines.
- A deliberate exception to 60/30/10: the Brain's color ratio puts Navy and Off-White at 60 percent with lime held to small moments. The live surfaces (TV and phones) give Royal, Lime and Sunrise a larger share. Documents and the report keep the standard Clearway look. The facilitator view and scribe console use Clearway Live with a calmer, mostly light palette. The Brain's color\_usage\_ratios entry needs a note for the live app.
- Warning and Error stay off the TV and phones, and Sunrise stays off the facilitator and scribe views where Warning lives, so the two warm colors never meet. They show failures quietly.
- The Five Lenses share one lens color (Royal) and are told apart by name and icon, the same on every surface and in the report.
- The group palette (up to 10 groups) is drawn from Off-White, Sky Blue and Soft Lime and tints of each, tested for contrast and for color-blind readers.
- The alignment signal's four states pair a color with an icon and a label, and are marked facilitator-only so no TV or phone component can use them.
- Meaning always comes from a label, icon or size as well as color, and all text meets WCAG AA for its size.

**Texture on dark screens** (Decided: a quiet texture from the Clearway mark. Treatment Open)

- Every Navy screen carries a still texture drawn from the Clearway mark, behind content, so text contrast is unchanged and it never competes with live motion. The mark keeps its shape and is never stretched, rotated or skewed.
- Chris is considering the outline version of the mark (the circle and arrow drawn as a line). If chosen, the Brain's logo entry needs the outline variant added. The Clearway Design System's rule that the mark is a logo, not a texture, gets a live-app exception (Decided October 29): on dark TV and phone screens only, the mark may be used as a texture. Everywhere else, including the control surface, documents and the website, the rule stands.
- Decided October 29: the outline mark throughout, with a texture set automatically by screen type (see Clearway Live). Join, welcome, breaks and Nothing live: oversized mark with glow. Section openers: offset pattern with glow. Live input screens: edge strip, whose first mark turns Lime as the LIVE marker. Headline with depth, Scripture and prayer: glow only. Phones waiting or phones down: offset pattern. Phones answering or reading: plain Navy.

**How the TV shows popularity**

- Word clouds: size and color together (see INT-01). Size follows the square root of the count from the TV minimum to headline size. Color steps from Sky to Off-White to Sunrise for the leader on Navy. A new word shows Lime for a moment. A repeated word swells and shifts color over about 400 ms while neighbours ease aside.
- Scales: the average large with the spread as live columns beneath (INT-05).
- Polls, rankings and 100 points: live horizontal bars, the leader on top, growing as answers land and trading places with a smooth slide, each with its label and its count or share. Royal on Navy, the leading bar in Sunrise. On a light screen the same bars sit on Off-White with Navy labels.

**Motion.** The design system is where "the screen is alive" becomes exact.

- Each movement (arriving, making room, swelling, growing and trading places, the cut line, drifting into groups, labels growing, phones dimming, spotlight on and off, hide) gets a duration, an easing curve and a delay rule as tokens.
- Starting points: the 400 ms swell, the Clearway Design System's motion tokens and signature easing, and slower, calmer timing for regrouping on the TV.
- When many phones submit at once, arrivals are staggered into a steady flow.
- Every movement has a still equivalent for reduced motion.
- Each motion spec ships as a short prototype in Claude Design plus a written spec Codex can build exactly.

**Components** (each interaction as a TV and phone pair, matching INT-01 to INT-16 and the Wayfinding screens). At a minimum: wall card, cluster group and label, word cloud word, bar with cut line, 100-point allocator, grid dot, tally and count, read-back paragraph with source chips, commander's intent card, Vision Outcome row with confirm, rename and challenge, goal card with CORE letters, join screen with QR and presence, sign-in, remote controls, burst countdown, Go live and Nothing live, scribe tag chips, photo capture, markers for AI drafted, AI grouped, reviewed, anonymous and named, Scripture and prayer screens, headline-with-depth screens, the signal card, and the "only you see this" treatment.

**States every component covers**: empty, first item, typical, crowded (50 phones, or more items than fit), offline and queued, phones down, AI off, reduced motion, and very long text or names. A crowded TV screen shrinks content to the TV minimum, then groups or pages it, so text always stays readable from the back of the room.

**References from a Synrg-run gathering.** Chris shared the slide deck, survey results, synthesis report and shared commitment from the ATKI Canada gathering (Calgary, October 2026), which Synrg ran. They are references for look and structure, not templates to copy.

- Screens: one bold brand color with a large repeating mark as texture, cropped at the edges. Small capitals for eyebrows, sources and footers under very large headlines. Oversized numbers with a short label over a thin rule. One dark callout block per slide for what the numbers mean. Waffle grids and simple bars with percentage and count.
- Reports: an at-a-glance strip of four big numbers, then the handful of things the room said in one line each. Ranked bars, a heat table by role, and a dot plot comparing two scores with the gap shown. A commitments register in which nothing enters without an action, one owner, a date and a measure of done. Verbatim quotes, names only where someone owns a step, thin data labeled, sources per section.
- The shared commitment's two-page shape (vision, the problem, posture, commitments, one shared goal) is a model for the board summary of the Clearway Map.

**Handoff to Codex**

- Tokens are exported from Claude Design as one source file that generates the app's styles, set up to match CORE's styling approach.
- Components carry the same names in the design files and the code, and every high-fidelity screen carries its screen ID.
- Motion arrives as tokens plus prototypes.

**Design passes** (design runs one milestone ahead)

| Pass | Covers | Ready before |
| --- | --- | --- |
| 1 | Connecting the existing Clearway design system, app tokens, phone and laptop foundations, sign-in and attendee components | Milestone 1 |
| 2 | TV themes, type scale and texture, motion tokens and prototypes, the remote, the facilitator view, wall card, word cloud, offline and reconnecting states, the private-view treatment | Milestone 2 |
| 3 | Every general interaction with its states, content screens, the group palette | Milestone 3 |
| 4 | Lens colors, Wayfinding components (lens wall, cluster and rename, outcome rows, pre-mortem grid, goal builder, intent card, draft Map), Scripture and prayer screens | Milestone 4 |
| 5 | Scribe console, overnight review, read-back | Milestone 5 |
| 6 | Discover setup screens, Four Helpful Lists, signal cards | Milestone 6 |
| 7 | Publish to CORE, report, communication plan, read-only copy, check-ins | Milestone 7 |

**Done when**

- Every color pairing used in a component passes WCAG AA in an automated check.
- TV type has been read from the farthest seat in the practice room before milestone 2 is accepted.
- The motion prototypes run with 50 simultaneous arrivals without jumping or flashing, and Chris signs them off in the practice room.
- No component uses a raw hex value, and no TV or phone component uses a facilitator-only token.

## Non-functional requirements

The room is small, so the bar is reliability, speed and feel rather than scale.

| Area | Requirement |
| --- | --- |
| Live feel | Everything in "The screen is alive". Measured in every milestone from 2 |
| Speed | Phone to TV under 1 second, 95 times in 100, with 50 phones. Go live moves every phone within 1 second. Phone pages load in under 2 seconds on 4G. The TV animates smoothly (60 frames per second) on the reference TV device |
| Size | Rooms of 8 to 50 people. Surveys of a few hundred responses (one past engagement had 360). Several engagements can run at once, each in its own room |
| Offline | Phones and the scribe console queue input and sync in order. The TV keeps its last state |
| Devices (Default) | Phones: current and previous major versions of iPhone Safari and Android Chrome, with nothing to install. TV: a separate laptop or desktop running a current Chrome, Edge or Safari at 1080p, connected to the TV or projector by HDMI or screen mirroring (Decided). The reference TV device is a laptop on HDMI. Smart-TV browsers and streaming sticks are supported only once tested in the practice room. Control surface and scribe: a current laptop browser |
| Readability | TV text readable from the back of the room. Minimum sizes set in the design system and checked in the practice room |
| Accessibility | WCAG AA contrast for text. Touch targets at least 44 px. Phones respect reduced-motion and text-size settings. Every color-coded meaning also has a label, icon or size |
| Security | Row-level security on every table, with tests. Participant, scribe, team facilitator and TV sessions can't read facilitator-only data (the signal, presenter notes, drafts, authorship). Secrets stay on the server. Sign-in codes expire and are rate-limited. Read-only links are revocable. The connections to Team Hub and CORE expose only the columns the app needs |
| Privacy | Answers are anonymous on screen and stored with identity for the record (see "Who sees authorship"). AI use is disclosed. No other data restrictions for now. Churches are in Canada and the US, so consent wording and how long engagement data is kept should be checked against Canadian privacy law before first use with a church (Open). Anything on the TV can be photographed, and the disclosure says so |
| Reliability | The live room keeps running if AI, Team Hub, CORE or the setup side fails. Nightly database backups (Supabase) |
| Monitoring | Each submission's phone-to-TV time is logged and summarized after every session. Server and client errors are captured with an error-monitoring tool, matching what CORE uses if it has one |
| Copy | Every word follows "Words in the app" |

## Milestones

Milestones 1 to 7 in order, with no dates (the order was delegated to Claude by Chris). The live room comes first because everything runs on it and it's the riskiest part. The interaction library proves the live screen across every kind of input and replaces Mentimeter on its own. The Wayfinding tools build on it, scribe and overnight need real lens input, Discover and the signal enrich a retreat that already works, and the CORE handoff needs goals and cards to publish. Each milestone is done when its test script passes in the practice room and the definition of done is met.

### 1. Foundation

User stories

- As Chris, I sign in with my Clearway Google account and create an engagement for a church already in Team Hub.
- As Chris, I build the attendee list from Team Hub people, a CSV or a pasted list, and mark each person as participant or scribe.
- As Chris, I send invites. Each person gets an email with the room link.
- As a participant, I open the room link, tap "Send me a sign-in code", and sign in with the code or by tapping the link. My phone stays signed in for the engagement.
- As Chris, I let in someone who isn't on the list from the door list, or sign someone in by hand with the code their phone shows.

Acceptance criteria

- Only Clearway Google accounts reach control and setup pages. A participant session can't load them or read their data.
- The code and the tap-to-confirm link both sign a person in, and the code works on a different device from the email. Codes expire and are rate-limited. Opening the link without tapping (as a link scanner does) signs nobody in.
- An email not on the list can ask to join, and an approval lets that phone in without another step. Manual sign-in works with the phone's device code.
- A signed-in device stays signed in until the engagement closes.
- Each engagement stores its Team Hub client id and Team Hub engagement id, and the church can store a CORE organization id (empty until linked).
- How the room decides (SET-09) explains consensus in plain words and appears in the invite email and on the pre-call welcome.
- The practice engagement and the Riverside seed engagement exist, and the practice engagement can be reset.
- Preview deployments, the test suite and row-level security tests run on every pull request.

Screens: SET-01, SET-02, SET-03, SET-09, PRE-01 to PRE-05, FAIL-07. Not in this milestone: sessions, Discover, any live screen.

### 2. The live room

Entry gate: Chris has signed off the motion prototypes in the practice room.

User stories

- As Chris, I open live.clearway.co on the computer at the TV, see a pairing code, and pair it from my control surface.
- As Chris, I set up a short run of show and go live on a session from my remote, move Next and Back, or choose Nothing live.
- As a participant, I send a word and see it land on the TV within a second.
- As Chris, I start a burst of 3 to 5 minutes with a countdown, and phones go down when it ends.
- As Chris, I spotlight or hide an answer from my remote.

Acceptance criteria

- With 10 real phones, and a simulated 50, 95 of 100 submissions reach the TV in under 1 second, measured from the latency log.
- The remote, the TV and the control surface always show the same session and the same counts.
- The word cloud follows the motion rules: repeats swell, neighbours ease aside, nothing jumps, nothing redraws.
- With wifi switched off mid-burst, phones queue answers. On reconnect they arrive in order with no duplicates, and the TV never goes blank.
- Closing and reopening the TV browser resumes the current session without re-pairing.
- With the facilitator's laptop closed, the remote runs the session.
- The TV runs on a separate computer connected by HDMI, and by screen mirroring, with no connection to the facilitator's laptop, and as a shared screen in a video call.
- Refresh phones reloads every phone and never the TV. Show the TV view on phones works when the TV is switched off.
- The run of show and prompts print from the control surface.

Screens: FAC-01 (without the alignment signal), FAC-03, FAC-04, SET-07 (basic run of show), D1-01, D1-02, D1-03, FAIL-01 to FAIL-06, FAIL-08, FAIL-10. Not in this milestone: AI, other interaction types.

### 3. The interaction library

User stories

- As a facilitator, I add any interaction or content screen to a run of show, live or self-paced, and set its prompt, depth and settings.
- As a participant, I answer each on my phone, see my answer land on the TV, and change or withdraw it while the session is open.
- As Chris, I run a team workshop end to end without Mentimeter, from a saved template.
- As Chris, I rehearse a run of show in its engagement and clear the test answers.

Acceptance criteria, per interaction

- Word cloud: the answer limits and matching rules hold. Repeats swell, and size and color follow the popularity rules. AI combines near-duplicates with undo.
- Open text: a wall of cards that fade in and reflow. Optional AI grouping with undo, pin and off. An AI summary appears only after Show summary.
- Q&A: anonymous questions with upvotes. Folded questions show "asked by 3", and every fold can be undone. The top questions rise with a glide. Spotlight and Answered work.
- Multiple choice: live bars that grow and trade places. Answers can change until close.
- Scale: the average and live columns, the average marker sliding.
- Ranking: bars ordered by average place glide as averages change. Added options appear on every phone.
- 100 points: the 100-point rule in Defaults holds. Bars reorder with a glide and a cut line slides. Points can move until close.
- 2x2 grid: a numbered dot per item at the average placement, duplicates merging and growing.
- Private form: answers never reach the TV, which shows only the count.
- Sign together: names arrive one at a time with the count.
- Content screens: headline with depth, Scripture, prayer, image or document page, screen check, holding.
- Self-paced sessions open and close on time and are reachable from the room link and from email.
- Clear test answers removes every test submission from an engagement and is logged.
- Each session's input exports as CSV, and the results recap works.
- Every interaction passes the live-screen rules with 50 simulated phones.

Screens: INT-01 to INT-10, SET-07, SET-08 (team workshop template), FAIL-09. Not in this milestone: Wayfinding-specific interactions.

### 4. Wayfinding session tools

User stories

- As Chris, I start an engagement from the Wayfinding template or the day-and-a-half template, with the base year, lens names and church identity (Mission, Purpose, Values, Strategy, Leadership Rhythms) set.
- As a participant, I rank success measures and start seeding Five Lenses sentences on the pre-call, and keep seeding until Day 1. My sentences appear first when each lens opens.
- As the room, we write in the present tense for each lens while similar sentences cluster live.
- As the room, we turn the Five Lenses into 6 to 10 candidate priorities, rename and merge them, spend 100 points, and Chris marks the provisional Vision Outcomes.
- As the room, we add 3-year Vision bullets to each outcome, and an empty outcome stays flagged until it has one.
- As the room, we confirm, rename or challenge each outcome, and Chris records the consensus decision and reasons.
- As the room, we name and place risks on the pre-mortem grid, and propose 1-year goals that each answer a risk, with a title, a result, one owner and an end date.
- As Chris, I hand the remote to a team facilitator. Pairs draft one commander's intent card per Vision Outcome, the room affirms the cards, the remote comes back, and the draft Clearway Map appears.

Acceptance criteria

- Seeded sentences stay hidden until the lens opens.
- Clustering never delays a sentence reaching the TV. The facilitator can undo, pin or turn it off. AI candidates reach the TV only when the facilitator sends them.
- Confirming an outcome records the room's consensus decision and its reasons, and is never decided by a count. The app warns when fewer than four or more than six are confirmed.
- A goal shows each CORE letter as met or missing, checked in code, and stays flagged until all four are met. Owners come from the attendee list or are added by name and email, one person each. End dates default to a season end.
- In the two-day template, each goal links to at least one pre-mortem risk. In the day-and-a-half template, risk links are added after the follow-up session. Each Vision Outcome records what the church will stop.
- Pairs are assigned from the remote or picked on phones. Two phones can edit the same intent card, with one person per field at a time, and edits replace the old line on the TV as they're typed.
- A first step without an owner or a date is flagged on the card.
- The team facilitator's remote hides the alignment signal, presenter notes and other sessions. The facilitator's remote shows who has it, can take it back without the TV changing, and gets it back automatically after the block.
- There is no scribe console in the team-led block.
- The draft Clearway Map fills from the engagement and shows empty fields as empty.
- Every prompt shows the right years for the base year, and the right lens names.

Screens: PRE-06 to PRE-11, D1-04 to D1-13, D2-01, D2-02, D2-05 to D2-15, INT-12, INT-13, INT-15, INT-16, SET-08 (Wayfinding templates). Not in this milestone: the overnight draft and read-back (5), Discover data in What We Heard (6, entered by hand as headlines until then), the alignment signal (6), publishing to CORE (7).

### 5. Scribe and overnight

User stories

- As the scribe, I tag quotes, decisions, tensions, actions, questions and mitigations as they happen, and they attach to whatever session is live.
- As the scribe, I photograph the easel on my phone or upload a file, and it attaches to the current session.
- As Chris and my co-facilitator, we review AI drafts of each lens and the provisional outcomes overnight, with every sentence linked to its sources.
- As Chris, I publish the read-back, and the room agrees or corrects each lens in the morning.

Acceptance criteria

- With wifi off, the scribe keeps capturing. Cards and photos sync in order with no duplicates.
- Speaker names on scribe cards are stored for the record and never shown on the TV or to participants.
- Drafts are ready within 30 minutes of Day 1 closing, and each sentence links to the phone input, scribe cards or photos it came from.
- Two facilitators can review at once. A section one is editing is locked for the other.
- A facilitator can swap AI wording for the room's exact words in one action.
- Nothing from the drafts reaches the TV or phones until published.
- In the read-back, corrections the room agrees fold into the draft as tracked changes once accepted.

Screens: SCR-01, SCR-02, OVN-01 to OVN-03, D2-03, D2-04, INT-14, FAIL-03.

### 6. Discover and the alignment signal

User stories

- As Chris, I build or connect the congregational survey and share an open link. Answers are anonymous and the count updates live.
- As Chris, I run the Four Helpful Lists on the TV and phones.
- As Chris, I upload interview and input-conversation notes and get themes with no names attached, which I edit and accept.
- As Chris, during a session I see private signal cards: aligned, divergent, silent and thin data.

Acceptance criteria

- Survey and conversation themes show how many answers or conversations each rests on, and thin data is flagged by the rule in Discover. Small segments are hidden.
- Possible duplicate survey answers are flagged, never blocked.
- Only accepted themes reach What We Heard and the signal.
- Signal cards never reach the TV or any participant's phone, tested.
- From a signal card, the facilitator can put a neutral question on the TV that carries no data and doesn't name the signal.
- Aligned signals can be saved as citations for the report.
- What We Heard headlines with depth are generated from accepted themes for the pre-call.

Screens: SET-04, SET-05, SET-06, SET-10, FAC-02, INT-11.

### 7. CORE and after

User stories

- As Chris, I review what will be created in CORE, fix any gaps, and publish from the room.
- As Chris, I edit an AI report draft in Clearway's report order, sign it off, and export it.
- As Chris, I review an AI-drafted communication plan built from what the room said.
- As a participant, I answer a short 30, 60 and 90-day check-in about my own first steps.
- As an elder, I open a read-only copy of the plan and its status.

Acceptance criteria

- Publishing waits until every goal and first step passes the readiness check, and needs the lead facilitator.
- Publishing runs as one CORE-side transaction: every record is created or none is. Invitations are sent only after it commits. A failure leaves nothing partial in CORE and shows the reason on the remote and control surface.
- Publishing adds records and never overwrites existing ones. The facilitator sees any overlap first. A second publish adds only what's new.
- Owners are matched to CORE users by email. Anyone without a CORE account gets a CORE invitation through CORE's invite flow.
- Check-ins go out by email at 30, 60 and 90 days and read each goal's status back from CORE.
- The report follows Clearway's order and exports as a Clearway-branded Word document and PDF.
- The read-only copy has no edit controls and its link can be revoked.

Screens: COR-01 to COR-03, AFT-01 to AFT-05.

## Test plan

- **Practice room scripts.** Each milestone has a written script Chris runs: who holds which device, what to send, what should happen on the TV, and what to break (wifi off, TV browser closed, laptop closed, TV switched off).
- **Load.** A script simulates 50 phones submitting in bursts against the preview deployment, and reports the latency log's percentiles.
- **Devices.** Each milestone from 2 is tested on at least two iPhones and two Android phones, a laptop on HDMI, a laptop mirroring to a TV, and a screen share in a video call.
- **Network.** Tests run on throttled and dropping connections, including 30 seconds offline mid-burst, and with realtime blocked to prove the fallback.
- **Security.** Automated tests prove each role can read and write only what this PRD allows.
- **AI.** Prompt fixtures run on every change. Failures block the merge.
- **Accessibility.** Automated contrast checks on every component, and a reduced-motion pass on the TV and phones.

## Not in the first release

These come from the references and earlier conversations and are deliberately left for later.

- Table mode for large events: seating modes, table facilitators and scribes, table notes pages, table reports, a projector of every table (Synrg), and AI passing ideas between tables (Thinkscape).
- Board session and key leader gathering engagement types (they run as team workshops until then), and the short congregational survey after the vision series.
- AI deck drafting, research and slide design in a studio (Synrg's builder). The run of show is built by hand from templates.
- Personal attendee pages, registration, check-in desks, agenda and walk-in pages driven by an event program, and program sync from a Google Doc.
- People sync from Planning Center, Eventbrite, Airtable or Google Sheets (Team Hub, CSV and pasted lists cover it).
- Event messaging beyond invites, sign-in and check-in emails.
- Quizzes, who-will-win predictions and a statements vote (unless Chris adds them, see Open questions).
- Video sessions played on the TV.
- Hearts and private notes to the facilitator from phones, and a personal take-home of the session with a person's own notes.
- Answering for someone else on the same phone, and chosen names.
- A stage pulse screen for live survey results.
- Native apps.
- Writing back to Team Hub.
- Languages other than English (Open).

## Open questions

Only Chris can answer these. Each names when it's needed, and nothing blocks earlier than that.

| Question | Options | Needed by |
| --- | --- | --- |
| Default TV screen | Dark (Navy), light (Off-White), or chosen per room. Royal stays the main color either way | Design pass 2 |
| The church on the TV | Church name only, the church's logo beside Clearway's, or Clearway only | Design pass 2 |
| Mentimeter coverage | Confirm the ten general interactions cover Clearway's uses, or add quizzes, predictions or a statements vote | Milestone 3 |
| Scripture text | The facilitator pastes passages (the Default), or a Bible text service, keeping in mind that many translations limit display | Milestone 3 |
| Names in free text sent to AI | Send free text and photos as written (the Default), or add a step that removes names first | Milestone 3 |
| Pre-work before the pre-call | Ask questions on phones before the pre-call (for example celebration and success measures, seeding the pre-call), or start with the pre-call | Milestone 4 |
| Seeded lens sentences | Hidden from everyone until Day 1 (the Default), or visible to the facilitator beforehand to prepare | Milestone 4 |
| Perspective, reality and strategy | On October 28 Chris described the 3-year and 1-year work as "the current perspective, the reality, the strategic moves". Add a current-reality line per Vision Outcome (drawn from Discover) beside its 3-year Vision and 1-year Outlook, or leave the flow as it is | Milestone 4 |
| This Year's Priorities | Name three to five Annual Initiators in the retreat (a short session after the 1-year Outlook), or leave them for the church's Annual Planning | Milestone 4 |
| The day-and-a-half follow-up | In person or on video, and how soon after the half day | Milestone 4 |
| Discover survey | Build the survey in the app, or use the survey builder Team Hub already has (surveys and responses linked to engagements) | Milestone 6 |
| Conversation notes | Upload and paste only, or also import Granola transcripts | Milestone 6 |
| How the app writes to CORE | An endpoint or database function added to CORE that creates everything in one transaction (the Default approach), built in CORE's repository with Chris's approval | Milestone 7 |
| Status of new Vision Outcomes in CORE | CORE defaults new outcomes to On track (Green). Keep that, or set another status at publishing | Milestone 7 |
| Where 30-day first steps go in CORE | Tasks linked to a goal, a goal of their own, or project tasks | Milestone 7 |
| The 3x3 Vision Matrix | Also place each 1-year goal in CORE's Vision Matrix (year 1, in the church's matching season), or leave the Matrix for after the retreat | Milestone 7 |
| Owners without a CORE account | Goals published with no owner and flagged until the invitation is claimed, or held in the app until then | Milestone 7 |
| CORE seats | How invitations for about 8 owners fit a church's CORE plan (the Free plan has one seat) | Milestone 7 |
| Churches not yet in CORE | Who creates the CORE organization, and when | Milestone 7 |
| AI disclosure | The wording, and where it appears (invite, sign-in, survey) | Before first use with a church |
| Privacy and retention | Consent wording and how long engagement data is kept, checked against Canadian privacy law | Before first use with a church |
| Language | English only for now, or French as well for churches in Quebec | Before first use with a church |
| Name | "Clearway app" is a working name. Chris also called it the Clearway live app on October 29. A coined word, or keep a Clearway name | Before a church sees it |

## Defaults to confirm

These keep the build moving. Chris can change any of them. Until he does, build to them.

| Area | Default |
| --- | --- |
| How it gets built | One milestone at a time, Chris accepting each, design running one milestone ahead |
| Engagement types | Wayfinding, day and a half, team workshop and practice in the first release |
| Engagement close | Device sign-ins, the read-only copy and check-ins stay active until the facilitator closes the engagement, after the 90-day check-in |
| Roles | Only the lead facilitator publishes to CORE |
| Sign-in | The invite opens the room page and "Send me a sign-in code". Codes expire after 10 minutes with 5 attempts. Links sign in only after a tap. A gentle "not on the list" message. Manual sign-in by device code |
| Authorship | Nobody in the room sees who wrote what. Authorship appears only in a facilitator's full export |
| Answers | Changing an answer is Decided. Withdrawing one is Default |
| Pairing and sessions | TV pairing and device sign-ins last until the engagement closes. More than one TV can be paired |
| Late answers | Queued offline answers are accepted up to 2 minutes after a session closes if queued before it |
| Word cloud | Three words and 28 characters per answer, commas split up to five, three sends per person. Synrg's matching rules. AI combining from about 30 different answers |
| Open text | Up to 280 characters. An AI summary appears only after Show summary, then refreshes after 8 answers or 75 seconds |
| Q&A | Questions up to 200 characters. Askers count 2 and voters 1. The top three on the TV |
| Ranking | Unranked options take the middle of the remaining places. Add an option is a setting |
| 100 points | Steps of 5. A person's points count once all 100 are placed |
| Moderation | Off by default per session. The profanity filter always on |
| Bursts | Countdown on the remote and phones, not on the TV. Working blocks count into overtime |
| TV | Room size "very small screen" (largest type) for a U-shape of 8. Join strip on for the first session of each day |
| Stagger | No answer held more than 1.5 seconds after it reaches the TV |
| Snapshot check | Every 5 seconds while live, every 1 to 2 seconds in fallback |
| Remote | "Syncing" after 2 seconds without TV confirmation. Reload offered after 12 seconds. The facilitator's own remote shows a short signal list |
| Handover | The team facilitator assigns pairs. One person per card field at a time. The remote returns automatically after the team-led block |
| Quotes | Promoted scribe quotes show on the TV anonymously |
| Wayfinding template | The session times, interactions and prompts in "Wayfinding sessions", including a short Day 1 celebration of about 20 minutes, and the "lands in" mapping |
| Day and a half | The half day ends after confirming outcomes and the 1-year Outlook. The pre-mortem and commander's intent move to the follow-up |
| Metrics | The facilitator curates ranking options in setup |
| Owners | Chosen from the attendee list or added by name and email |
| Outcome descriptions | A one-line description per Vision Outcome, drafted by the facilitator from the room's words |
| Intent card | "What we'll stop" is asked on the commander's intent card |
| Scripture | The facilitator pastes passages |
| Practice room | Phones join with the room link. The control surface and remote need a Clearway sign-in. Reset nightly and on demand |
| AI | A fast Claude model live, the most capable Claude model overnight and for the report and signal. Identity fields stripped. Merge limits as listed. Fixture tests on every change |
| Overnight | Drafts ready within 30 minutes of Day 1 closing |
| Signal | Silent signals appear only after phones first go down in a session |
| Discover | Thin data under 10 responses, under 10 percent of respondents, or one interview. Segment breakdowns hidden under 5 respondents. Possible duplicate survey answers flagged, never blocked |
| Team Hub | Read only, never written to |
| CORE | Invitations as MEMBER. Publishing additive and in one transaction |
| Read-only copy | Available once published to CORE. The report added after sign-off |
| Realtime | Supabase Realtime broadcast with the snapshot check, and snapshot fallback when a venue blocks realtime |
| Devices | Current and previous iPhone Safari and Android Chrome. The reference TV device is a laptop on HDMI |
| Environments | Local, a preview per pull request on a Supabase branch or staging project, and production |
| Exports and recap | CSV per session, report as Word and PDF, Map as PDF, full engagement as JSON. A results recap page |
| Success measures | As listed below |

## Success measures

Measured from the app itself (Default):

- Phone-to-TV time: 95th percentile under 1 second in every live session.
- No lost submissions in any session, including through wifi drops.
- Overnight review time: about 45 minutes.
- Report sign-off within a week of the retreat (it currently takes about 30 days).
- Every Vision Outcome, goal and first step in CORE by the end of Day 2.
- At 90 days, the share of first steps done, from check-ins and CORE.
- Team workshops run without Mentimeter.

## Glossary

| Term | Meaning |
| --- | --- |
| Engagement | Clearway's work with one church, holding everything from Discover to check-ins |
| Control surface | The facilitator's laptop view and phone remote, in charge of the TV and every phone, never shown to the room |
| Session | One item in the run of show: a prompt with an interaction, or a content screen |
| Run of show | The ordered list of sessions for an engagement |
| Live | The one session currently on the TV and phones |
| Self-paced | A session open on phones between two times, outside the live room |
| Burst | A timed window of 3 to 5 minutes when phones are open for input |
| Phones down | Input locked between bursts. The TV holds still |
| Room state | The single server record of what's live, which every screen follows |
| Team-led block | Consecutive sessions run by a team facilitator holding the remote |
| Seeded input | Answers collected earlier that appear first when a session opens |
| Read-back | The overnight draft shown back to the room on Day 2: "Did we hear you right?" |
| Alignment signal | Private cards comparing the room with Discover: aligned, divergent, silent, thin data |
| Vision Outcome | One of the church's four to six strategic priorities in its 3-year Vision |
| Indicators | The 3-year Vision bullets under a Vision Outcome. CORE stores them as indicators |
| CORE goal | A 1-year goal that is Connected, Owned, has a clear Result and an End date |
| Commander's intent | What must be true by the end of the 3-year Vision even if every plan changes |
| Practice room | The permanent engagement for rehearsing with real phones and a TV |
| Team Hub | Clearway's CRM, the source of churches, people and engagements |
| CORE | Clearway's dashboard where churches run their goals through the year |

## Related documents that need updating

Each needs Chris's OK before it changes.

- **Clearway Brain, wayfinding\_process and five\_lenses:** still describe a one-and-a-half-day retreat. Chris decided two days with a day-and-a-half option.
- **Clearway Brain, color\_usage\_ratios:** needs a note for the live app's Royal-led palette and Sunrise.
- **Clearway Brain, logo\_assets:** needs the outline mark if Chris adopts it for the texture. The Clearway Design System also needs the live-app exception to its rule that the mark is a logo, not a texture.
- **Wayfinding Preparation Guide:** it describes the current process (Celebration and Metrics on Day 1, Communication Plan on Day 2, a TV cabled to Chris's laptop). The app-facilitated process will need its own version, which asks churches for a computer at the TV with HDMI or screen mirroring.
- **This project's instructions:** "Stack: Supabase and Claude, shared with Team Hub and CORE" predates the decision to run on a separate database.
- **The Concept to Completion plan:** its "Choices for you" table is partly decided now.

## Sources

- This project's files: 01 product brief, 02 Wayfinding method, 03 retreat flow, 04 retreat narrative, 05 reference platforms.
- The earlier conversations in this project ("Synrg platform for wayfinding" and "Project instructions and attachments", October 28 and 29) and the decisions recorded since.
- The Clearway Brain: wayfinding\_process, five\_lenses, four\_helpful\_lists, framework\_core\_goals, framework\_vision\_alignment\_hierarchy, clearway\_map, wayfinding\_horizon\_terms, preferred\_terms, industry\_terms, core\_platform, framework\_ministry\_seasons, and the visual entries (read October 29).
- The Wayfinding Preparation Guide (Google Drive), for the current process only.
- The wireframes and user journeys canvas (66 screens, journeys, interaction library and failure states).
- Synrg: the full guide at synrg.live/guide, the public test room on all three surfaces (synrg.live/TEST, /s/TEST, /p/TEST), the results, pulse, walk-in, tables, table notes, desk and agenda pages, and the legal pages (read October 29).
- The ATKI Canada gathering's slide deck, survey results, synthesis report and shared commitment, shared by Chris.
- CORE's database (clearway-core) and Team Hub's database (clearway-team-hub) schemas and constraints, read October 29.
