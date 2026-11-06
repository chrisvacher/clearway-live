# Practice-room script: milestones 3, 4 and 6

This is the acceptance run for milestone 3, the interaction library. It takes about three hours, so plan two sittings: sections 1 to 5 in one, sections 6 to 11 in the other. Each check names what you do, what the TV and phones should show, and the pass mark. Mark each one pass or fail, and note anything that felt slow, jumpy or confusing, even if it passed.

Section 11 carries the milestone 2 real-device checks forward. They still apply to every new interaction.

## Before the day

- **Devices:** at least eight phones (a mix of iPhones and Android phones; ten is better), the facilitator's laptop, your phone as the remote, a separate computer at the TV, a TV with HDMI, a second way to show the TV by screen mirroring (AirPlay or Chromecast), and a video call to share the TV in.
- **The address:** live.clearway.co. It runs the merged build on the clearway-live database.
- **Two engagements.** The practice room, for sections 2 to 6 and 11. A team workshop engagement for a fictional church, for sections 7 to 10, set to "Use AI in live sessions" in setup. Replace one of its attendee emails with an address you can read on a phone.
- **A run of show in the practice room** with one session of each kind: Word cloud, Open text (AI on), Q&A (with "Questions any time" on), Multiple choice, Scale, Ranking (with "Add an option" on), 100 points (with a cut line), 2x2 grid, Private form, Sign together and Statements. Add one of each content screen: Headline with depth, Scripture (paste a passage, and add a reference), Prayer and silence, Image or document page (with a photo of a page), Screen check and Holding. Use the drag-to-build palette to add them.
- **Reset practice room** before you start, so earlier guests and answers are cleared.
- **The load test:** Claude runs 50 simulated phones against live.clearway.co while you watch.

## 1. Set up the room (10 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| On the TV computer, open live.clearway.co/tv. On the laptop, open the practice room's setup, choose Pair a TV and enter the code | The TV moves to the holding screen with the church's name | The TV pairs on the first try |
| Show the join screen, then join on every phone with the room link | Names arrive on the TV one at a time | Every phone is in and named on the TV |
| Open the control surface on the laptop and the remote on your phone | Both show the same "On the TV now" | They match |

## 2. The content screens (15 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Go live on Headline with depth | The TV shows the headline very large, and the number in Sunrise if you set one. Phones show the detail, quotes and Read more sections | No phone is empty, and the TV never flashes white |
| Go live on Scripture | The TV shows three pieces: the passage, the reference and the translation. A bold phrase is bold. Phones show the same passage to read | The translation is the engagement's when you left it blank |
| Go live on Prayer and silence | A dark, still TV, or a single line. Phones say Phones away | Nothing moves on the TV |
| Go live on Image or document page | The page at its own shape, never stretched, with the room link small in a corner. Phones show it to zoom | You can pinch to zoom on a phone |
| Go live on Screen check | The edge lines, the circle and the type ladder fill the TV. Phones show fixes for overscan and aspect | Every Lime corner is visible and the circle is round |
| Go live on Holding | The church's name, the event and the texture, and the day's outline if you wrote one. Phones say you're in | A long outline sits in two columns and stays on the screen |

## 3. Text interactions (25 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Go live on the word cloud. Before anyone sends, look at the TV | "Waiting for answers" and a count of 0 answers | Nothing else on the TV |
| Everyone sends one word. Then try four words in one answer, and 30 letters in one word | Words land on the TV within about a second. The phone holds Send and says why for the long answers | No word is cut short, and the phone never sends what it refused |
| Send "Hope, joy, peace" in one send, and "hopes" from another phone | The comma makes three answers. "hopes" counts with "hope" | The count rises by the right number |
| Send repeats of a few words | Repeats grow and their neighbours ease aside. The leader turns Sunrise | Nothing jumps or re-sorts |
| Keep going until there are about 30 different words, including "youth" and "young people" | AI combines them into one word with the AI mark, and the foot of the TV says Combined similar answers. A phone that sent "young people" says it is on the screen with youth | The combine animates, never a redraw |
| On the control surface, press Undo on the combine | Both words come back, animated, and the AI mark goes | It undoes in one press |
| Go live on the open text wall. Everyone sends a sentence | Cards fade in where they land and the wall reflows. With AI on, groups with short labels form beside the answers, marked as AI | No text drops below readable size |
| On the control surface, rename one group, pin another and undo a third | Each change shows on the TV within a second | The undone group's answers stay on the TV in arrival order |
| Look for a summary on the TV, then press Show summary | No summary until you press it. Then an AI summary opens above the groups, marked as AI | The summary appears only after Show summary |
| Press Hide summary, then turn AI off for the session | The summary closes. The wall falls back to cards in arrival order, oldest first | Nothing on the TV says AI is off |
| Go live on Q&A. Everyone asks a question, two people ask almost the same one | Questions arrive anonymously. The near-duplicates fold into one that says "asked by 2" | No name appears anywhere on the TV |
| Everyone upvotes one question | It rises to the top with a glide. The TV shows the top three with "+ more on your phones" | Rows glide, never swap |
| On the control surface, Undo fold on the folded question | It comes back as its own row | Every fold can be undone |
| Spotlight a question, then go live on another session | The question stays large on the TV over the next session | It holds over the other session |
| Press Answered | The spotlight clears, and phones list the question under Answered | It clears in one press |
| On another session, tap Ask on a phone (Questions any time) | The question goes into the shared pool and the TV quietly says how many are waiting | The question stays off the screen until you show it |

## 4. The bar family and statements (25 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Go live on multiple choice. Before anyone answers, look at the TV | Empty bars for every option and "0 answering" | The empty structure shows |
| Everyone picks one, then two people change their answer | Bars grow and trade places. The leader is on top in Sunrise, each with "n · %" | Bars move from where they were, never back from zero |
| Go live on the scale. Everyone taps a number, then a few change it | The average large ("3.8 average of 8"), the spread as columns, the average marker sliding | The marker slides, never jumps |
| Go live on the ranking. Half the room ranks every option, the other half only two | Bars ordered by average place, each with "avg 2.3" | A partial ranking counts |
| On two phones, tap Suggest an option and suggest nearly the same option | The control surface shows one suggestion from 2 people. Press Add to every phone | It glides onto the TV and appears on every phone marked New |
| Go live on 100 points. On one phone, drag one line past the budget | The other lines give up points in proportion. Points left always shows. Send waits until all 100 are placed | Only full budgets count on the TV |
| Everyone sends, then two people move points | Bars reorder with a glide and the cut line slides with them | The cut line never jumps |
| Go live on statements. Everyone rates every statement, some agreeing and some disagreeing on one | One bar per statement with the average and the share who agree. The split statement is flagged Divided on the control surface | Divided never appears on the TV |
| Spotlight one option on any of these, before anyone has picked it | It lifts in Sunrise over the room with its numbers | It works with no votes yet |

## 5. Grid, private form and sign together (20 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Go live on the 2x2 grid. Each phone places three items by tapping a number and then the grid | One numbered dot per item at the room's average, sized by how many placed it, with the legend beside the plot | Dots glide to new averages and never overlap |
| Drag a placed dot on one phone | The TV's dot glides to the new average | It glides, never jumps |
| On the control surface, Merge into one item from another | The duplicate's dot glides into the survivor and the survivor grows. Undo merge brings it back | Both directions animate |
| Go live on the private form. Everyone answers, including something you would never put on a screen | The TV shows only the count of responses. The control surface shows each answer with the person's name | Nothing anyone wrote ever reaches the TV or another phone |
| Go live on sign together. Everyone reads the text and signs with a finger | Signatures arrive one at a time with the name under each and the count | Each name is the person's own, not typed |
| Hide one name, then Unhide it. Then Close signing | The name fades and the rest close up, then it returns with its signature. Closed shows on the TV | Phones keep their signature after closing |

## 6. Self-paced sessions (15 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| In the practice room's run of show, add an open text session as Self-paced, open from now for one hour. Add a multiple choice as Self-paced, opening in 10 minutes and closing 5 minutes after | Each row says Self-paced and its window, and takes no room time | The other sessions' times don't move |
| On a phone, look at the waiting screen | Both are listed under On your phone. The later one says when it opens | No draft is ever listed |
| Answer the open one while the TV shows something else | The answer saves on the phone. The TV never shows it | Not one self-paced answer reaches the TV |
| Wait for the second one to open, without refreshing the phone | It opens on the phone on time, takes an answer, then closes on time with "This step is closed. Your answers are kept." | It opens and closes on its own, within a few seconds |
| In the team workshop engagement, send the invites. Open the invite on your phone | The email lists the open self-paced session under Before we meet, with your own link | The link opens that session after you sign in |

## 7. Templates and the run of show builder (15 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Open Templates and preview the team workshop | 90 minutes, 11 sessions, Ships with the app | Times run from the start to 1:25 |
| Choose Use this template for the team workshop engagement, starting tomorrow at 7:00 p.m. | Its run of show fills with eleven Ready sessions, each with its prompt, settings and presenter notes | The first session starts at 7:00 p.m. and each starts when the one before ends |
| Drag Multiple choice from the palette between two sessions | A gap opens where it will land. Dropping it opens its options in place | The rows glide apart and back, never jump |
| Fill in its options and press Done | It saves as Ready and every time after it moves by its length | The times still add up |
| Drag a session to another place, then press Remove on the one you added | Times recalculate each time | Nothing jumps |
| Press Save as template, name it, then open Templates | Your template is listed, saved by you | It keeps every session |

## 8. Rehearse and clear the test answers (15 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| In the team workshop's control surface, press Start rehearsal | Rehearsing shows in the header. Every phone says "Rehearsal. Your answers are test answers and will be cleared." | Every phone shows the line |
| Rehearse four sessions: the check-in, the word cloud, the open text wall (press Show summary) and the questions (spotlight one) | Answers reach the TV as normal. The Rehearsal panel counts the test answers | The count matches what you sent |
| Press Clear test answers while a session is live | It is held, with "Choose Nothing live first" | Nothing is cleared |
| Press Nothing live, then Clear test answers and tap again | "Cleared n test answers and set 4 steps back to Ready." Last cleared shows who and when | The spotlight, summary and AI groups from the rehearsal are gone |
| Look at the TV, every phone and the run of show | No rehearsal answer anywhere. Each phone shows 0 of 3 sent on the word cloud. The four steps are Ready | Nothing from the rehearsal survives the clear |

## 9. Run the team workshop end to end (35 minutes)

Run every session in order with Next, from the control surface. Every phone answers each one.

| Do | What should happen | Pass when |
| --- | --- | --- |
| Screen check, Welcome and Opening prayer | The check, then the welcome and outline, then the prayer line. Phones show fixes, then You're in, then Phones away | Each change reaches every phone within a second |
| Check-in (scale) | The join strip in the corner, then the average and columns as people tap | The TV count, the laptop's Answered this session and the remote agree |
| One word for this season (word cloud) | The cloud fills. Once there are about 30 different words, AI combines near-duplicates, marked as AI | No rehearsal word appears |
| What's working (open text) | Cards arrive and AI groups them under labels. Press Show summary | Groups form while everyone is still sending, not only after |
| Where to focus (100 points) | Bars by share, with the line after the top three | Only full budgets count |
| Effort and impact (2x2 grid) | One dot per focus area at the average | Five dots, legend beside the plot |
| Your questions (Q&A) | Questions fold and rise with votes. Spotlight the top one, then press Answered | It starts at 0 questions: the rehearsal's question is gone |
| Our commitment (sign together) | Every signature arrives with its name. The count reaches everyone in the room | Every name is right |
| Sending prayer, then Close Day 1 (tap twice) | The TV goes to its holding screen. Every session is closed | Phones show their own answers, read-only |

## 10. Export, the recap and AI disclosure (15 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Open See results recap | One card per session that took answers, each with the TV's picture of its results and its count | No content screen and nothing from the rehearsal |
| On each card, press Download CSV and open it | One row per answer, with the kind's own columns. Anonymous sessions have no Name column; Our commitment does | Every Test answer cell is empty |
| Press Download all as CSV | One file with every session's answers | The rows add up to the cards' counts |
| Press Print or save as PDF | A clean printout without the buttons | It fits on letter paper |
| On a fresh phone, open the team workshop's room link | Under Sign in: "We use AI to group similar answers and help draft summaries. It never receives your name or email, and anything it produces is marked as AI. How we use AI" | The last three words are a link |
| Tap How we use AI. Then open the same page in a private browser window, signed out | Chris's approved wording, ending with the icon credit | It opens without signing in |
| In setup, turn off "Use AI in live sessions" and open the room link again | No AI line under Sign in. The invite email has no AI paragraph | Turn it back on afterward |
| Make AI slow (Claude does this while you watch on a test engagement) | Answers keep landing in arrival order. The control surface and remote say AI is slow. The TV never says so | The room keeps working throughout |

## 11. Real devices and the network, carried forward from milestone 2 (40 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Go live on a word cloud, then on a multiple choice, with phones open. Claude starts the load test on each | 50 simulated phones send bursts. The TV keeps flowing and bars keep gliding | Nothing redraws |
| Real phones keep answering during the load | Their answers still land within about a second | Every real answer lands |
| Open the Phone to TV report, Show the last hour | At least 95 of every 100 answers reached the TV in under one second | Read it before you break anything below |
| On two phones, switch wifi and mobile data off for 30 seconds mid-burst on a choice, a grid and a form. Keep answering | Each answer says "Saved on this phone" and the header says Offline (FAIL-01) | Answers wait on the phone |
| Switch them back on | The saved answers send in the order written, each once | The TV never goes blank |
| Unplug the TV computer's network for 30 seconds while phones keep answering | The TV keeps its last screen with a small Reconnecting mark. The laptop offers Show the TV view on phones (FAIL-02) | Within 3 seconds of plugging back in, the TV catches up without reloading |
| Close the TV computer's browser completely, then reopen the /tv address | It returns to the current session (FAIL-04) | No pairing code |
| Block the TV for 3 seconds while you press Phones down | The remote shows Syncing, the laptop a quiet warning, then both correct (FAIL-06) | The TV wins |
| Close the laptop and run 5 minutes from the remote only | Next, Back, bursts, Phones down, Spotlight, Hide, AI undo and Summary all work (FAIL-05) | Nothing needs the laptop |
| Refresh phones from the remote (tap twice) | Every phone reloads and keeps its drafts. The TV does not reload | Drafts survive |
| In the team workshop, sign in on one phone with the email you added and answer. Then sign in on a second phone with the same email | The second phone shows your earlier answers (FAIL-08) | Your answers are there |
| Print the run of show from the control surface | Every session, prompt, phone depth and presenter note prints (FAIL-10) | It prints |
| Move the TV computer from HDMI to screen mirroring, then share its screen in a video call | The room keeps running. Remote viewers see the live room | No re-pairing |
| Turn on reduced motion for the TV (setup, TV settings) and run one bar session | Bars and dots take their places at once and fade in briefly | Turn it off again |

## Milestone 4: the Wayfinding sessions

Sections 12 to 21 are the acceptance run for milestone 4. Run them in a Riverside engagement started from the Wayfinding template, with eight real phones, set to "Use AI in live sessions". Press Reset practice room first if you use the practice room instead. There are no Publish to CORE rows: Publish to CORE is not part of the app (Chris, November 4). Section 11 above is carried forward unchanged, and it still applies to every Wayfinding session.

## 12. Start from the template and rehearse (20 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| In setup, choose Start from a template, pick Wayfinding, set the pre-call start and start the engagement | 40 sessions in three parts, Day 1 at 9:00 and Day 2 at 8:30 church time, no Publish to CORE session | Every session has a kind and a time |
| Choose Rehearse, answer a few steps from the phones, end the rehearsal, then choose Clear test answers | Test answers, candidate suggestions and scribe cards from the rehearsal disappear, real answers stay | Nothing from the rehearsal is left on the TV or in the exports |
| In the practice room, press Reset practice room after uploading a photo and a card in the scribe console | The scribe cards and the uploaded file are gone too | The scribe console is empty |

## 13. Seed the Five Lenses (10 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Open Seeding the Five Lenses on the phones. Each person picks a lens and writes two sentences in the present tense | The phone says the words are hidden. The control surface shows how many are written for each lens, never the words | You cannot read a seeded sentence anywhere, the facilitator included |
| Go live on the first lens on Day 1 | That lens's seeds appear first on the TV, then live sentences join them | Only the open lens shows its seeds |

## 14. The lens wall (25 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| With every phone writing, watch the wall while AI is working | Each sentence appears on the TV within about a second and clusters drift into place without jumping | No sentence waits for AI |
| Switch AI off from the AI panel, then on again | The wall carries on in arrival order, then groups again | The TV never mentions AI |

## 15. The lens summaries (30 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| After the last lens, go live on The 10-year Future, by lens | A present-tense draft of lens 1 appears on the TV marked as AI, one screen, every line sourced | Lines read in the present tense |
| Phones tap Approve or Suggest a change | The two counts rise on the TV at once. Up to two suggestions show as anonymous cards, the rest are counted | No name is on the TV |
| Wait for the folded version, then edit a line by hand | The new version glides in with tracked changes. Your hand edit is not a tracked change and AI leaves it alone | Rows glide, none jump |
| Mark a decision, then go to the next lens and repeat for all five | Each lens shows Signed off on the TV and takes no more answers | Five lenses signed off |

## 16. Provisional Vision Outcomes (30 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Go live on Provisional Vision Outcomes, review the AI's candidates and Send to the TV | The cards appear together. Phones can rename, merge or suggest | No suggestion shows on the TV |
| Accept a rename, a merge and a new candidate with one tap each | The card changes name in place, one card leaves, one arrives | No card jumps |
| Open the 100 points, let the phones spend them and Mark provisional | Bars glide and re-order in the server's order, five outcomes remain | Five provisional Vision Outcomes |

## 17. The 3-year Vision, first pass and confirm (30 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Go live on 3-year Vision, first pass. Type a bullet on a phone slowly | The letters appear on the TV as they are typed, marked as typing, until the person taps Add bullet | The bullet stays on the TV when added |
| Have every phone add two bullets quickly | The newest six show and the rest are counted | Nothing is dropped and nothing flickers |
| On Day 2, go live on Confirm the Vision Outcomes. Phones confirm, rename or challenge | The TV shows counts only, never reasons. A challenged outcome gets a soft highlight | The facilitator's decision, not the count, confirms an outcome |
| Mark four outcomes as confirmed | Four rows show decided on the TV | Four to six outcomes are confirmed |

## 18. The pre-mortem (25 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Go live on the pre-mortem. Everyone names a reason the plan failed | Reasons appear in the TV's legend at once. AI merges duplicates later | Ten fit, an eleventh is turned away politely |
| Place every reason on the grid | Dots glide to the room's average | The count on the TV is the server's |
| From the control surface, record a mitigation | It shows under its reason on the TV | The mitigation is there |

## 19. The CORE goals (30 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Go live on 1-year Outlook. Each phone proposes a goal with a title, result, owner and end date | Goals appear on the TV with four letters, Connected, Owned, Result and End date, each met or missing | A goal missing a letter is outlined |
| Mark a result as clear from the control surface | Its Result letter turns on | A goal changes by the facilitator's tap only |
| Add more goals than fit | A line says how many more there are | None is hidden without a count |

## 20. The team takes the remote (40 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Give the remote to a participant from the control surface | Their phone shows Next and Back. The TV does not change | You can take it back with one tap |
| Go live on Commander's intent and put people in pairs | Pairs show on phones only, never on the TV | Four cards, one for each confirmed outcome |
| Each pair writes its intent, must-do and what we will stop | Lines replace on the TV as they are written | Nothing flickers |
| Present one card, then back to all cards | The card grows to full size and shrinks back | Smooth both ways |
| Go live on Affirm together and have everyone sign | Signatures appear on the TV one at a time, with the full commitment written from the cards | Every phone's signature appears |

## 21. The draft Clearway Map and the video follow-up (30 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Open Draft Clearway Map on the control surface | Two pages: Identity and direction, then Action. The 10-year Future shows the signed-off summaries, the 3-year Vision the confirmed outcomes, the 1-year Outlook the goals that meet CORE | Empty fields say they are empty and why. This Year's Priorities is left for Annual Planning |
| Print or save as PDF, and Download text | Two pages without buttons, and a text file | The Map never appears on the TV or phones |
| In a day-and-a-half engagement, issue the follow-up link and code for the Follow-up part, then open the link on a phone with no Clearway sign-in | The code unlocks the remote. The page says what the remote never shows | The team facilitator can move Next and Back |
| Open the link's TV page on the computer shared in the video call | The shared TV view follows the room | Revoking the link returns the remote to you |
| Print the run of show from the Wayfinding template | Every session, prompt, phone depth and presenter note prints (FAIL-10) | It prints |

## Milestone 6: Discover and the alignment signal

Sections 22 to 30 are the acceptance run for milestone 6. Run them in the practice room on live.clearway.co, with the TV paired, at least eight real phones and "Use AI in live sessions" on. Press Reset practice room first. Everything in sections 22, 24, 25 and 26 is for the facilitator only: the TV and the phones must never show a finding, a note, a theme, a draft or a signal card. Keep an eye on the TV and one phone through every section. Section 11 above is carried forward unchanged, and it still applies to every Discover and signal surface.

Claude runs the kit for these sections with 50 simulated phones (`npm run test:acceptance-m6`) while you watch the practice room, as in section 11.

## 22. Set up Discover: survey findings and notes (25 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| In the practice room's setup, open Discover | A page marked Only you see this, with "Notes stay with Clearway" and "No themes yet" | Nothing on it is on the TV or a phone |
| Under the survey, type 100 in People who answered and choose Save total. Add three findings: "Small groups are easy to find", 52%, rests on 52; "Giving is generous", 45%, rests on 45; "Young families", 5%, rests on 5 | Each finding becomes its own theme in the Themes list, already accepted, with "52 of 100 respondents". The third says "5 of 100 respondents, fewer than 10" and carries the Thin mark. The first is marked Strong | Only the third is thin. Fifty-two percent is Strong; forty-five percent is Strong too |
| Add a fourth finding that rests on 200 respondents | A plain sentence says it can't rest on more people than the survey's total of 100 | Nothing is saved |
| Change the first finding's respondents to 40 and choose Save finding | Its theme follows it. There is still one theme for the finding | No duplicate theme appears |
| Pick Interview, type a person's name in Person (for the record only), a title and some notes, then choose Add pasted notes. Add four more notes: two more interviews and two board or staff input conversations | Each note is listed by title with its word count. The person is kept for the record | The person's name appears nowhere except beside the note you typed it on |
| Pick Input conversation and add a Word file, a PDF and a text file together | Each is read on the server and added as a note. The files are not kept | A file that can't be read (a scan, a password PDF) says why and what to do |

## 23. The Four Helpful Lists, live with phones (35 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Add a Four Helpful Lists step to the practice room's run of show (in a Discover part ahead of the Pre-call) and go live on it, with AI on | The TV shows four lists with their headings (What's right? What's wrong? What's missing? What's confused?), outlined and waiting, and a count of 0 cards from 0 people. No generic waiting line | Nothing else is on the TV |
| On every phone pick a list and send a card in a few words | Each card slides in on the TV within about a second, in its list, with the Lime moment, and the count rises | Every card lands under a second and nothing jumps |
| Send a second card to another list. Send the same words in two different lists | The cards stay in their own lists. Near-identical words in the same list fold beneath one card | Cards never move across lists |
| On the phones, tap Agree on other people's cards. Tap again to take it back. Look for Agree on your own card | The count ticks on the TV and the card glides up its list. A second tap takes it back | Agree is never offered on your own card, and a person counts once |
| Send several near-duplicate cards in one list ("Roles of staff are confusing", "Elder and staff roles are unclear") and wait | AI slides the similar cards together beneath one card marked AI, with how many it stands for. The cards were on the TV first | No card waited for AI |
| On the control surface, press Undo last AI change, then Pin a card, Hide another and Unhide it | Each shows on the TV within a second. Undo puts the folded cards back | Hidden cards leave the TV and come back |
| Turn AI off for the step | AI folds disappear. Those cards stand alone on the TV | Nothing on the TV says AI is off |
| Claude runs 50 phones against the step | Cards and agrees keep landing | Phone to TV report: at least 95 in 100 under one second |
| Open the review of the Four Helpful Lists in setup and choose Download CSV | Every card by list, with agreement counts and its fold, read only. The file names no one | No person is named anywhere |

## 24. Draft and accept themes (30 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| On Discover, choose Draft themes | Themes arrive from the notes and the cards, each with the AI icon, a count such as "2 of 5 conversations" or "5 of 20 people", and the notes or cards it rests on. A theme resting on one interview is marked Thin | No person is named on the page, and nothing reaches the TV or phones |
| Accept one theme from the conversations and one from the Four Helpful Lists. Press Undo on one, then Accept it again | Accepted themes are marked. Undo takes it back | The count of accepted themes is the number you accepted, plus one for each survey finding |
| Rename a theme | It keeps "Renamed from" and the old name | The name you typed is the one on the page |
| Merge one theme into another of the same kind. Open Merged themes and choose Split out | The merged theme glides beneath the survivor and the survivor's count recounts once. Split out reverses it | The count never counts one conversation twice |
| Reject a theme, open Rejected themes and choose Bring back | The theme fades off the page, then returns as a draft | It is a draft again, not accepted |
| Add a note, then choose Redraft themes | Accepted themes stay. Only new themes are offered beside them, and a rejected theme is not offered again | No theme appears twice |
| Claude makes AI slow, then choose Redraft themes. While it works, choose Add a theme by hand and write one resting on a note | The page says "This is taking longer than usual". The theme you wrote is accepted at once, with no AI icon | You can keep working while it runs |
| Claude makes AI fail, then choose Redraft themes | "AI couldn't draft themes this time", with Redraft themes and Add a theme by hand still working | Nothing else on the page changes |

## 25. What We Heard (25 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Check that the run of show has the four What We Heard steps (Congregational survey, Four Helpful Lists, Board and staff input conversations, Leadership interviews), from the Wayfinding template or added by hand with the source in the options | The Discover page lists a row for each | A source with no step says so and links to the run of show |
| Leave one theme as a draft and reject another. Choose Draft What We Heard | A headline with depth for each source that has accepted themes, with the AI icon, the lead figure as the number, and quotes the room said. A source with nothing accepted says "Nothing accepted yet" | No draft or rejected theme is named in any headline. Thin data says "(thin data)" on its line |
| Edit the survey headline and choose Save draft, then Redraft What We Heard | Your edit is kept | The edited line is still there |
| Choose Apply on a draft | "Applied to the step". In the run of show the step has the headline, the number, the source and the phone depth, and nothing else changed | The step is not live and the TV has not changed |
| Mark the step Ready and go live on it | The TV shows the number and the headline, with the marked phrase in bold. Phones show the depth | The change reaches phones in a second and the TV never flashes white |
| Go live on another step, then try Apply on the step that is on the TV | Apply is off, with "That step is on the TV right now. Apply after it's off." | The live step is untouched |
| Claude makes AI slow, then fail, and you choose Redraft What We Heard | "This is taking longer than usual", then "AI couldn't draft the headlines this time". Type it by hand and Apply work in both | A hand-typed headline reaches the step |

## 26. The alignment signal (35 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Go live on a wall session (the signal also runs on a word cloud, a lens and Q&A). Open the control surface and the remote on your phone | The control surface's private panel, "Alignment signal, only you see this", says "Nothing stands out yet" and how many silent themes wait until phones first go down. The remote shows a short list | Both show the same list, and neither is on the TV |
| Everyone sends at least one answer. Make sure some speak of an accepted theme ("small groups meet in homes"), two or three head another way ("we should add a third service") and a few speak of the thin finding ("young families") | Within about 45 seconds cards arrive in the panel and on the remote with a soft rise: aligned, divergent and thin data. Answers are on the TV in a second while the cards come | The TV and every phone show no card, no theme and no word such as aligned or divergent. Hold a phone beside the TV and check |
| Say something about a theme you left as a draft ("volunteers are stretched") | The room's answers land, and no card speaks of that theme | Only accepted themes raise cards |
| Open an aligned card | Its theme from Discover with its strength and where it came from, and the room's own words | No person is named |
| On the aligned card choose Save as a citation. Open a divergent card | The aligned card says "Saved as a citation". The divergent card has no such button | Only aligned cards can be saved |
| Dismiss a card | It fades, the list closes up after it, and the remote's list closes up too | It stays dismissed when the room says more |
| Open the divergent card, edit the suggested question, and choose Put the question up. First try wording that names the theme or a percent | The first is refused with a plain sentence. The edited, neutral question is accepted | The refused wording never reaches the TV |
| Watch the TV as the question goes up | The TV cross-fades to the question. The room's count and the AI line fade away. Phones keep the live step | No blank frame and no flash. The question carries no theme, number or signal kind |
| Choose Back to the session | The question fades out, and the step, its count and the AI line return | The step is as it was |
| Press Phones down and wait | Within a minute a silent card appears for a strong theme nobody has spoken of. It does not appear before phones go down | It is on the panel and the remote only |

## 27. The signal with the laptop closed, and AI slow or failing (25 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Close the laptop and keep the wall session going from the remote. Send more answers | The remote lists the cards it had and adds a new one when it comes (FAIL-05) | A new card reaches the remote alone |
| From the remote put a question up, take it down, and dismiss a card. Press Phones down, then Open phones | Each works from the remote and reaches the TV. A silent card shows on the remote after Phones down | Nothing needs the laptop |
| Reopen the laptop. Claude makes AI slow (FAIL-09) and phones keep sending | Every answer is still on the TV in a second. The control surface says "AI is slow." and the cards already up stay | The TV never says anything about AI |
| Claude makes AI fail | The control surface says "AI isn't responding." No new cards arrive, the cards already up stay, and you can still put a question up and take it down | The room keeps working throughout |
| Go live on the Four Helpful Lists with AI failing. Send cards, hide one and agree on a phone | Cards land at once, folds stop, Hide and Agree work | The TV never mentions AI |

## 28. Offline and the TV on the new surfaces (15 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| On two phones, switch wifi and mobile data off during the Four Helpful Lists. Write a card or two and tap Agree on another person's card | Each card says "Saved on this phone". The header says Offline (FAIL-01) | Nothing reaches the TV |
| Switch them back on | The cards send in the order written and the agrees send, each once. The TV count and agree numbers rise | Each card and agree is counted once |
| Unplug the TV computer's network while phones add cards to the Four Helpful Lists (FAIL-02) | The TV keeps its lists with a small Reconnecting mark | Within 3 seconds of plugging back in, the TV catches up without reloading |

## 29. Who cannot see it (10 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| On a phone signed in as a participant, open the control surface and the Discover page | You are sent to sign in or refused | No finding, note, theme or card is shown |
| Open the scribe console | The scribe sees no signal card and no theme | Nothing from Discover is there |
| Give the remote to a participant (the team facilitator) | Their phone shows Next and Back. The control surface says the cards stay with you | The team facilitator's remote shows no card |
| Check the TV and every phone one last time | No finding, note, theme, draft, card or neutral question except the one you put up on purpose | Nothing leaked |

## 30. Clear up (10 minutes)

| Do | What should happen | Pass when |
| --- | --- | --- |
| Start a rehearsal, draft themes and run the signal, then choose Clear test answers | Drafted themes and signals from the rehearsal go. The findings, the notes and the survey themes stay | Real setup data is untouched |
| Press Reset practice room | The findings, notes, themes, drafts and signals are all gone, and the survey total is cleared | Discover is empty and the Four Helpful Lists step has no cards |

## Afterward

- Note the Phone to TV numbers you read in section 11 before breaking anything.
- Note which phones and browsers you used, the venue network, and anything that felt slow or wrong.
- Milestone 3 is accepted when sections 1 to 11 pass. Milestone 4 is accepted when sections 11 to 21 pass. Milestone 6 is accepted when sections 11 and 22 to 30 pass. A row that fails becomes the next fix.

The browser kits run most of these on every pull request (milestone 4 has `npm run test:acceptance-m4` and `npm run test:wayfinding`; milestone 6 has `npm run test:acceptance-m6`, and `npm run test:browser` carries its failure checks): each interaction with 50 simulated phones, and the team workshop end to end with eight phones, a rehearsal and Clear test answers (`npm run test:team-workshop`). This script is the real-device, real-room version of them.
