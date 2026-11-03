# SurveyLink

The linked Team Hub survey on SET-04: its title, status and close date, locked questions, the open link and QR code to copy, Open in Team Hub, and a warning if it collects email.

**Screens:** SET-04. **Sets:** Setup. Design pass 6 (milestone 6).

**Consumer provides:** The linked survey (title, template, status draft, open or closed, opened and close dates, link code, locked at), whether it collects email, Team Hub reachability, or a CSV import's file, rows and matched columns.

**Anatomy:** A card with the clipboard-list icon, the title, a run-status chip (Draft in Team Hub, Open · closes, Closed), the template, question count and dates, and a lock line. The share block holds the QR code and the read-only link from Team Hub with Copy link and Download QR code. Open in Team Hub reads as leaving the app: the external-link icon and the host, team.clearway.co. Unlink is a ghost action.

| State | Behavior |
| --- | --- |
| No survey linked | Open in Team Hub to create it, Link a survey, Import a CSV |
| Linking | Only surveys linked to this engagement in Team Hub |
| Draft | No link or QR code until published in Team Hub |
| Open | Link, QR code, questions locked since the first response |
| Closed | Link disabled, Team Hub shows its closed message |
| Collects email | Warning banner: the app never shows an email (Default) |
| CSV | File, rows, matched columns, unmatched kept out |
| Team Hub unreachable | Warning banner, the last read stays |

**Don't:** Copy Team Hub's styling, offer question edits once Team Hub has locked them, or ever show an email.
