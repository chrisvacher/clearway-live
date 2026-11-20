# Design pass 10 evidence

The signed-in sweep checks the shared facilitator pages, a Clearway workshop, a Novetera workshop and a Wayfinding retreat. Each check runs in Chromium at 390, 1280, 1440 and 1512 pixels. At 1440 pixels it captures each rendered page and the People, Access, Templates and Blocks tab states. The sweep checks redirect destinations at all four widths. It also captures settled open and closed Room admin states at each desktop width.

In a local checkout with the Clearway Live Supabase stack running, build the app and run `npm run test:design-pass-10`. The sweep writes PNGs and the `sweep.json` manifest to this directory. Set `PASS10_SWEEP_SHOTS` to use a different directory. CI publishes the same output in its `design-pass-10-sweep` artifact and publishes the live room's open and closed drawer views in `design-pass-10-live-room`.

The test fixtures represent fictional engagements and people. The sweep uses the loopback Supabase instance with a local stand-in for email.

The six images in [E](E/) show the Clearway workshop transport with Room admin open and closed. They came from the isolated [transport evidence run](https://github.com/chrisvacher/clearway-live/actions/runs/44671047026).
