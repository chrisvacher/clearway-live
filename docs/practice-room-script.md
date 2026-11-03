# Milestone 3 practice-room script

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

## Afterward

- Note the Phone to TV numbers you read in section 11 before breaking anything.
- Note which phones and browsers you used, the venue network, and anything that felt slow or wrong.
- Milestone 3 is accepted when every row passes. A row that fails becomes the next fix.

The browser kits run most of these on every pull request: each interaction with 50 simulated phones, and the team workshop end to end with eight phones, a rehearsal and Clear test answers (`npm run test:team-workshop`). This script is the real-device, real-room version of them.
