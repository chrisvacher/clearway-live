# EaselCapture

The scribe's phone: one tap photographs the easel page, then Retake or Attach. It attaches to the live session. Files can be uploaded too.

**Screens:** SCR-02. **Sets:** Scribe phone. Design pass 5 (milestone 5).

**Consumer provides:** the live session, camera access, upload progress, the queue while offline.

**Anatomy:** Light phone on the scribe surface: sync state, Attaches to and the session, a viewfinder (`.cwl-scr-view`), a 72px shutter (`.cwl-scr-shutter`, `cwl-app-primary`), then Upload a file. After the shot: Retake and Attach.

| State | Behavior |
| --- | --- |
| Camera | One big button |
| Retake or attach | The photo with two buttons |
| Uploading | Progress bar |
| Attached | Info banner: it's on the console now |
| Saved on this phone | Offline: queued with a count, sends in the order taken |
| Didn't upload | Error banner, Retake and Try again |
| Nothing live | Shutter disabled with the reason |
| The team has the room | Off for the team-led block |
