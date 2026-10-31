# Motion review checklist · design pass 2

For Chris, on the practice-room TV computer, before milestone 2's build starts (the entry gate). Open `motion-review.html` full screen on that computer, then read the TV from the farthest seat.

## Motion sign-off

- [ ] **Add one answer.** It fades in where it lands; the rest glide aside. Nothing flashes.
- [ ] **Repeat an answer.** The word grows over about half a second, turns Sunrise when it takes the lead, and its neighbours ease aside. No jump.
- [ ] **Simulate 50 simultaneous answers.** The picture evolves in one continuous, gentle motion, with nothing stopping and restarting, readable from the back. The card reports Pass: longest hold under 1,500ms and no frames over 34ms.
- [ ] **Spotlight an item.** It lifts in Sunrise and the room recedes. Clearing it settles back calmly.
- [ ] **Hide an item.** It fades away, then the gap closes. Unhide brings it back.
- [ ] **Phones down and back.** The TV holds still; only the marker changes. The phone dims but stays readable.
- [ ] **Simulate reconnecting, then restore.** The TV keeps its last screen with a small Reconnecting mark. On restore, missed answers arrive in one pass and the mark fades. The TV never blanks.
- [ ] **Wall: 50 answers.** Answers stream into the right column without overlapping; the theme labels in the main area appear, grow and find their places, all in one colour.
- [ ] **Session change.** The next session cross-fades in. No white flash.
- [ ] **Reduced motion.** Every demo still works, with fades in place and no movement.

## Readability from the farthest seat

- [ ] Screen check: all four Lime corners visible, the circle round.
- [ ] The 36px floor ("23 answers") readable at room size "very small screen".
- [ ] The Reconnecting mark is not readable from the back (by design).

## Decisions to give

- [ ] Default TV screen: dark, light, or chosen per room.
- [ ] The church on the TV: name only, logo beside Clearway's, or Clearway only.
- [ ] Sign off the motion prototypes, or list what to change.
