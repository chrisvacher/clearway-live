# Milestone 2 practice-room script

This is the acceptance run for milestone 2, the live room. It takes about 75 minutes. Each check names what to do and what should happen. Mark each one pass or fail, and note anything that felt slow, jumpy or confusing, even if it passed.

## Before the day

- **Devices:** two iPhones and two Android phones (more is better: the target is 10 real phones), the facilitator's laptop, the facilitator's phone as the remote, a co-facilitator's phone as a second remote, a separate computer at the TV, a TV with HDMI, a second way to show the TV by screen mirroring (AirPlay or Chromecast), and a video call to share the TV in.
- **The preview link** for the build being tested, from the pull request.
- **A run of show** in the practice room with at least: Welcome and prayer (content, a Scripture passage), Celebration (word cloud, 5 answers allowed), Celebration wall (wall), and one more session in the same segment as the wall.
- **Reset practice room** before you start, so earlier guests and answers are cleared.
- **The load test:** Claude runs 50 simulated phones against the preview while you watch. It joins 50 practice guests to the clearway-live database. Say yes to that before the day.

## 1. Set up the room (10 minutes)

| Do | What should happen |
| --- | --- |
| On the TV computer, open the preview's /tv address | A large pairing code. Nothing else on screen |
| On the laptop, open the practice room's setup, choose Pair a TV, enter the code | The TV moves to the holding screen with the Clearway mark and the church name |
| Press F on the TV computer | Full screen. Press F again to leave, then return to full screen |
| On the laptop, show the screen check | Every Lime corner is visible, the circle is round. If not, set the TV to Just Scan, Screen Fit or 1:1 |
| Read the type ladder from the farthest seat | The "floor" line (36px) is readable. Note the room size you chose |
| Show the join screen, then join on every phone by scanning the QR code or typing the room link | Names arrive on the TV one at a time |
| Open the control surface on the laptop and the remote on your phone and the co-facilitator's phone | All three show the same "On the TV now" |

## 2. Run the room (15 minutes)

| Do | What should happen |
| --- | --- |
| Go live on Welcome and prayer | The Scripture cross-fades in. The TV never flashes white. Phones show the passage |
| Next to Celebration (word cloud) | The prompt on the TV and every phone within a second |
| Everyone sends one word, a few at a time | Each word lands on the TV within about a second of Send. A lone word shows Lime for a moment |
| Everyone sends the same few words | Repeated words grow; their neighbours ease aside. Nothing jumps or re-sorts. The leader turns Sunrise |
| Everyone sends at once | A steady flow, not a jump. No Lime while the flow runs |
| Start a 3-minute burst from the remote | A quiet countdown on phones. When it ends, phones go down on their own |
| Spotlight the leader, then clear it | The room dims behind a Sunrise card, then returns |
| Hide a word, then Unhide it | It fades away and the cloud closes the gap, then it returns |
| Compare the TV, the laptop and both remotes | Same session, same count, everywhere, every time |
| Each co-facilitator presses Phones down, then Open phones | Both remotes see each other's presses |
| Print the run of show from the control surface | Every session, prompt, phone depth and presenter note prints (FAIL-10) |

## 3. The load test (10 minutes)

| Do | What should happen |
| --- | --- |
| Go live on Celebration (word cloud) with phones open. Claude starts the load test | 50 simulated phones send three bursts of answers. The TV keeps flowing. Nothing redraws |
| Real phones keep sending during the load | Their words still land within about a second |
| Right after the load test, open the Phone to TV report (Room panel, "See the phone to TV report") and choose Show the last hour | At least 95 of every 100 answers reached the TV in under one second. Read it before section 4: answers sent while you break the TV on purpose count as slow, as they should |

## 4. Break things (25 minutes)

| Do | What should happen |
| --- | --- |
| On two phones, switch wifi and mobile data off for 30 seconds mid-burst. Keep answering | Each answer says "Saved on this phone" and the header says Offline (FAIL-01) |
| Switch them back on | The saved answers send in the order written, each once. The TV never goes blank |
| Unplug the TV computer's network for 30 seconds while phones keep answering | The TV keeps its last screen with a small Reconnecting mark (FAIL-02). After about 12 seconds, the laptop warns and offers Show the TV view on phones |
| Choose Show the TV view on phones | Every phone shows what the TV would show, with input underneath |
| Plug the network back in | Within 3 seconds the TV shows everything it missed, without reloading. Turn the TV view on phones off |
| Close the TV computer's browser completely, then reopen the /tv address | It returns to the current session. No pairing code (FAIL-04) |
| Switch the TV itself off, then choose Show the TV view on phones | Phones carry the room. Turn the TV back on |
| Block the TV from confirming: unplug the TV computer's network for 3 seconds while you press Phones down | The remote shows Syncing, the laptop a quiet warning, then both correct once it reconnects (FAIL-06) |
| Close the laptop. Run the next 5 minutes from the remote only | Next, Back, bursts, Phones down, Spotlight and Hide all work (FAIL-05) |
| Refresh phones from the remote (tap twice) | Every phone reloads and keeps its drafts. The TV does not reload |
| Hand one person a different phone. They sign in with their email code | They see their own earlier answers with a line saying so (FAIL-08) |

## 5. Other ways to show the TV (15 minutes)

| Do | What should happen |
| --- | --- |
| Move the TV computer from HDMI to screen mirroring | The room keeps running. No re-pairing |
| Share the TV computer's screen in a video call | Remote viewers see the live room |
| Turn on reduced motion for the TV (setup, TV settings) | Items take their places at once and fade in briefly. Turn it off again |

## Afterward

- Note the Phone to TV numbers you read after section 3. The report for the whole run includes the minutes you broke the TV on purpose, so it will read lower.
- Note which phones and browsers you used, the venue network, and anything that felt slow or wrong.
- Milestone 2 is accepted when every row passes. A row that fails becomes the next fix.

The browser failure kit runs most of section 4 on every pull request, including a run with live connections blocked. This script is the real-device, real-network version of it.
