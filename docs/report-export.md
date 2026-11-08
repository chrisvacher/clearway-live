# Exporting the report as Word and PDF (milestone 7, step 5)

AFT-01, ExportPanel and WordPreview. The signed off report (or the current draft, marked Draft) downloads as a Clearway-branded Word file and as a PDF of the same document. The look follows `docs/clearway-document-standard.md`, copied from the clearway-docs skill with Chris's October 2026 preferences on top: a white page, restrained bold (the cover's emphasis line, section eyebrows, H1 and H2 only), no contents page for a short report, headings kept with what follows, tables left to flow.

Migration: `supabase/migrations/20261108050000_report_export.sql` (one function, see "The one database change").

## Parts

| File | What it does |
| --- | --- |
| `lib/export/report-model.ts` | One document model from a sign-off snapshot or the live draft. The text cleaner. Nothing else reads the snapshot. |
| `lib/export/report-docx.ts` | The Word file, with the `docx` package. |
| `lib/export/report-pdf.tsx` | The PDF, with `@react-pdf/renderer`, from the same model. It loads the library when a PDF is built, because the library is an ES module only. |
| `lib/export/assets.ts`, `lib/export/assets/clearway-logo-dark.png` | The logo (640 px wide) and the full Plus Jakarta Sans files from `design/clearway-base/fonts` (regular, bold, italic and bold italic; OFL), so every Latin Extended letter in a name draws. `@fontsource` is not used. |
| `app/api/control/[id]/report/export/route.ts` | `GET ?format=docx\|pdf\|model&version=signed\|draft`. Node runtime. |
| `components/report/export-panel.tsx`, `word-preview.tsx` | The panel on the report page and a preview of the cover and two inside pages, drawn in HTML from the same model. |

`next.config.ts` lists the font files and the logo in `outputFileTracingIncludes` for the export route only (`/api/control/*/report/export`), so they are copied into the Vercel function (checked in the build's `route.js.nft.json`).

## The route

Facilitators only (lead and co-facilitator), under their own sign-in. The report's light status call `report_pulse` checks the role in the database first; anonymous gets 401, another engagement's facilitator 403.

- `version=signed` reads the newest sign-off through `public.report_export_signed` with the service role. With no sign-off it answers 409 `not_signed`. The snapshot has no sources, and the model reads only each sentence's text, origin, quote and thin label.
- `version=draft` reads `report_state` and marks the model Draft. With no draft it answers 409 `no_draft`.
- `format=model` returns the model as JSON for the page's preview.
- File names: `<Church> Wayfinding Report.docx` and `.pdf`, with ` (Draft)` before the extension for a draft. Characters a file name cannot hold are dropped.
- Missing functions (before the migration) answer `missing`, and the panel stays quiet: it falls back to the draft, or says "Export isn’t available yet", and nothing else on the page changes.

## The document

Cover: the logo, church name, "Wayfinding Report", PREPARED FOR (the church) and DATE (the retreat dates, left out when none), "Prepared by Clearway Church Solutions", and the standard's confidentiality notice in the cover's footer. The church name and dates are read live from the engagement on every export, including a signed one (only the report's text is frozen at sign-off). A draft adds a line saying it is not signed off, and every page of a draft carries DRAFT in its header. A signed file has no Draft word anywhere.

The 14 sections follow Clearway's order. Each has an eyebrow that names the part of the report in plain words, written in capitals because Google Docs ignores all caps, and the heading as an H1 that keeps Clearway's exact name ("07 / THE DIRECTION" over "The 10-year Future"). Sections 1 to 6 are THE CHURCH, 7 and 8 THE DIRECTION, 9 to 11 THE PLAN and 12 to 14 WHAT HAPPENS NEXT. The table is `reportParts` in `report-model.ts`.

- Prose sections: sentences read as paragraphs (three at most), a verbatim quote is a quote block, a thin data label is a callout right after its sentence, and the facilitator's own words are their own paragraphs.
- The 10-year Future: each lens as a small heading with its signed off lines, word for word. The model's lead sits above, the facilitator's own read below.
- The 3-year Vision and Commander's Intent: a small labelled table for each outcome or card (outcome, indicator, what we'll stop; intent, must do, what we'll stop, first steps with owner and date). The ranked key metrics are a numbered table.
- The 1-year Outlook: goal, Vision Outcome, owner, end date, season. Risks and Roadblocks: risk, likelihood, impact, mitigations. Decisions: decision and why. Make the Vision Visible: who, when, who tells them, what they hear, the risk it answers, with the scribe's action cards as a list after it.
- A record section with no rows and no sentences reads "Nothing has been recorded for this section yet." A prose section with none reads "Nothing has been written for this section yet." A table with no rows inside a section that has other content is left out. A Vision Outcome or intent card with nothing under it shows its title alone, and in a draft a lens with no signed off summary shows its name and "Not signed off yet."
- Footer on inside pages: the logo, the document title ("Wayfinding Report") and the page number. In the Word file the table header row repeats on each page a table runs onto. The PDF does not repeat it: react-pdf's `fixed` on a table header inside a wrapping view never finishes laying out (tried), so a long table in the PDF carries its header on its first page only. A contents page (a field the Word file fills in, and a linked list in the PDF) appears only when the report runs about eight pages or more (an estimate from the words and rows).

## The text cleaner

In anything Claude or a facilitator wrote: an em or en dash becomes a comma, a dash between two numbers, times, amounts, months or weekdays reads "to" (9am to 5pm, $5 to $10, Jan to Mar, Mon to Fri), a double hyphen becomes a comma and a semicolon becomes a comma. In the room's words (a quote block, a quotation inside a sentence, the 10-year Future's signed off lines) an em or en dash becomes a spaced hyphen, a semicolon stays, and nothing else changes. Hyphens are never touched, so 10-year Future, 3-year Vision and 1-year Outlook are exact. The tests check every line of a built file for dashes, and the Word and PDF text for semicolons outside quotes.

## The one database change

Step 1 keeps `private.report_signed_for_view` in the `private` schema, which the API does not expose, and it has no public door. The brief expected no migration, but the route could not read the sign-off without one. `public.report_export_signed(p_engagement)` is a `security invoker` wrapper over that function, executable by the service role only (revoked from public, anon and authenticated). It changes no table and no earlier function. The route checks the facilitator's role first, as above.

## Tests

- `tests/unit/report-export.test.ts`: the cleaner, retreat dates, the model (order, eyebrows, tables, no banned marks), Draft only on drafts, the Word file (headings in order, Plus Jakarta Sans only, the logo, thin labels, quotes, no dashes, white page, footer), the PDF (read with `unpdf`: headings in order, cover, thin label, quote, page number, no dashes), contents only for a long report, and sources never reaching the model. The fixture is `tests/fixtures/export/snapshot.ts`.
- `supabase/tests/database/report_export.test.sql`: the door exists, is an invoker wrapper, and only the service role can call it.
- `npm run test:report` (CI already runs it) now downloads both formats from the running app: refused before sign-off, the draft marked Draft, the signed files after version 2, another engagement's facilitator and an anonymous browser refused, and the page's Download buttons and preview.

## Defaults chosen

- Eyebrow and H1 repeat the heading ("NN / HEADING" over the heading), as the brief asks. The standard's rule 16 says they should differ; the brief wins here.
- The cover is white with the dark logo (the standard cover), not the navy cover in the pass 7 mock, because the standard and Chris's October preferences govern the file. The panel's preview shows the white cover.
- No attribution under a quote, so quotes stay anonymous as the report has them.
- The preview shows the logo mark, not the wordmark, to avoid a second copy of the logo in `public`.
