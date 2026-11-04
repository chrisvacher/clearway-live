# DraftParagraph

A lens of the 10-year Future in the present tense, headed with the lens and the year, with a source marker on each sentence.

**Screens:** OVN-02. **Sets:** Review. Design pass 5 (milestone 5).

**Consumer provides:** the lens, sentences with their AI wording, the room's exact words where there is one, and their sources; who is editing; review state.

**Anatomy:** Heading (`cwl-wf-lens-dot`, "Community, 2036"), provenance (AI drafted, Reviewed by, or Written from the room's sentences), the paragraph (`.cwl-ovn-para`, 16px at 1.85) of `.cwl-ovn-sent` spans each ending with `.cwl-ovn-mark` (count of sources; a quote mark when it's the room's words; Warning when none). The selected sentence gets a toolbar: Edit, Restore the room's words, Remove. Then Accept the lens (Lime, the view's one Lime moment).

| State | Behavior |
| --- | --- |
| Selected | `cwl-app-selected` with a Royal underline |
| No source | `cwl-app-warning-bg` tint and Warning marker; Accept waits |
| Restore | The AI wording crossfades to the room's words in place (`cwl-dur-line-replace`) |
| Editing | Text box with the focus ring |
| Locked | Sunken, the other facilitator's name and a lock; actions wait |
| Reviewed | Reviewed by, and a success chip |
| AI off | No draft; the room's sentences are added in their own words |
| Drafting | What it's built from, then skeleton lines |
