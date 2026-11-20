# Design pass 10 evidence

The signed-in Chromium sweep passed all 292 page, tab and redirect checks at 390, 1280, 1440 and 1512 pixels. It generated 63 PNGs from the shared facilitator pages, a Clearway workshop, a Novetera workshop and a Wayfinding retreat. The repository includes the 51 captures at 1440 pixels. The download also includes the 1280- and 1512-pixel drawer captures and the manifest for all checks. [Download the verified CI artifact](https://github.com/chrisvacher/clearway-live/actions/runs/44672701466/artifacts/14600924104).

- [Shared facilitator pages](shared/) covers Engagements, Create, Templates, Blocks, Clearway users and Operations.
- [Clearway workshop](workshop-clearway/) and [Novetera workshop](workshop-novetera/) show the facilitator pages and previews for both workshop brands.
- [Wayfinding retreat](wayfinding/) includes Discover, Four Helpful Lists and the retreat's follow-up pages.
- [Live room transport](E/) preserves the six open and closed Room admin views from the [earlier CI run](https://github.com/chrisvacher/clearway-live/actions/runs/44671047026).

The Wayfinding Remote capture shows the overnight review panel while it is loading. The remote controls are visible. [Wayfinding Remote](wayfinding/remote.png).

In a local checkout with the Clearway Live Supabase stack running, build the app and run `npm run test:design-pass-10`. Set `PASS10_SWEEP_SHOTS` to write PNGs and the `sweep.json` manifest to another directory. The test fixtures represent fictional engagements and people. The sweep uses the loopback Supabase instance and a local email stand-in.
