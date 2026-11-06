# Design pass 6 handoff

Design pass 6 covers Discover in the app and the alignment signal: the congregational survey read from Team Hub, survey results and themes in setup and in the room, the Four Helpful Lists, leadership interviews and input conversations, What We Heard, and the signal on the facilitator's private view and own remote. The reference export is in `design/clearway-live/pass-6/` (start with its `README.md` and `screens.html`). Its HTML files use relative paths. The export code is design reference, not an application script.

Archive SHA-256 (`clearway-live-design-pass-6.zip`, November 3, 2026): `942c55318fa914bc9579713ceee70fb76ca5842348b2c4178f30bef975db95d5`.

**November 5:** the app doesn't read the congregational survey (Chris), so SET-04, SET-04 results and SET-10, and the SurveyLink, ResponseCount, QuestionResult, SurveyResultScreen, SegmentFilter and DuplicateFlag components, are shelved. The survey report's findings are added by hand in setup. The Four Helpful Lists, SET-06, What We Heard and the signal stand.

## What's in it

- Hi-fi screens by screen ID: SET-04, SET-04 results, SET-10, SET-05, INT-11, SET-06, PRE-08 What We Heard, FAC-02 and the FAC-03 signal list, each with its empty, live, thin, error and reduced-motion states, in Navy and Off-White. FAC-02 shows the control surface with its TV mirror, the TV, phones and the facilitator's own remote together.
- Components named as they'll be in code: SurveyLink, ResponseCount, QuestionResult, SurveyResultScreen, SegmentFilter, DuplicateFlag, DiscoverTheme, ThinFlag, NotesUpload, FourListsBoard, FourListsCard, FourListsComposer, WhatWeHeardHeadline, SignalCard, SignalDetail, SignalList. The index is `pass-6/docs/screen-index.md`.
- Six motion prototypes with tokens and reduced-motion equivalents: new responses arriving, a theme growing, merging and rejecting themes, a Four Helpful Lists card landing, a signal card arriving, the neutral question going to the TV. The spec is `pass-6/docs/motion-spec.md`.

## Changes in this pull request beyond the export

- `design/clearway-live/live_tokens.css` gains `cwl-dur-signal-in` (900ms): a signal card's quiet arrival in the private panel.
- The reference `bundle.css` in the export guards the live marker size for a TV or phone drawn inside an app surface. The app isn't affected: its TV marker (`.tv-live`) has a fixed size of its own.

## Build notes

- The app reads Team Hub's `surveys` and `survey_responses` and never writes to them. It never shows a respondent's email, and warns on SET-04 when the linked survey collects email.
- The response count is read when setup opens and on Refresh. There is no live count in the room.
- Possible duplicates are flagged and never removed or blocked.
- Only accepted themes count, in What We Heard, the signal and the room.
- Thin data: under 10 responses, under 10% of respondents, or one interview. A thin result in the room drops the Sunrise number. Segments under 5 respondents are hidden with the reason and never show their count.
- Setup results keep the survey's option order, so a refresh grows bars in place. In the room, choice results use the pass 3 bars, leader first.
- The signal shows only on the control surface and the facilitator's own remote: never the TV, a phone or the team facilitator's remote. Every `cwl-sg-*` rule is scoped to `[data-surface="control"]`.
- The neutral question carries no data and doesn't name the signal. While it's on the TV, the room's count and the AI line are hidden.
- Save as a citation shows on aligned signals only.
- The Four Helpful Lists columns are told apart by heading and position, not color alone. The Team Hub link reads as leaving the app.

## Defaults

Chris confirmed all four Defaults as designed on November 3, 2026. The decisions board in `screens.html` records the other option for each.

| Decision | Default |
| --- | --- |
| Where survey themes come from | The app drafts themes from the open-text answers, and the facilitator accepts, renames, merges or rejects each one |
| A linked survey that collects email | Link it with a warning. The app never shows the email |
| Which questions make the segments | The template's About you questions: age band, years attending, involvement, and location for multisite churches |
| Where interview notes come from | Paste, Word, PDF or text |
