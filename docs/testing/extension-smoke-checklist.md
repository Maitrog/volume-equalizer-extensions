# Extension smoke checklist — offscreen tab capture

> **Manual Chrome run required.** Unit tests and mocks do not confirm user activation,
> offscreen document lifetime, or real audio. Run every scenario in a real Chrome
> window and record the browser version and result.
>
> Minimum supported version is Chrome 130. Verify on Chrome 130 and on the current
> stable Chrome. If Chrome 130 is unavailable, mark its run as **untested** instead
> of passing it.

Build with `npm run build`, load `dist/` as an unpacked extension, and use pages you
control for media playback.

## Scenario matrix

## Scenario matrix

| Scenario | Expected result | Current Chrome result |
| --- | --- | --- |
| Start → close popup → reopen | No extra window; audio and settings preserved | Untested — pending manual run |
| Pause for 60 seconds, then Play | Session still exists; audio resumes | Untested |
| Minimize browser / switch to another tab | Capture keeps processing | Untested |
| Terminate the service worker, then open the popup | Offscreen kept playing; state restored without a new capture | Untested |
| Capture A and B; disable EQ A; stop A | B is unaffected; bypassing A is not the same as stopping it | Untested |
| Change mute/gain/EQ shortcuts with the UI closed | One command changes exactly the intended tab | Untested |
| Start from an active ordinary EQ; change mute/gain | No double processing, no extra gain, no stuck mute | Untested |
| Reload/redirect the captured tab; create an iframe | Stream is preserved and a second EQ is prevented; on `ended` the UI clears the capture | Untested |
| tabCapture / getUserMedia denial / tab closed during start | Clear error or correct cancellation, resources released, other tabs keep working | Untested |
| Stop the last tab at the same time as starting a new one | The live new stream is not killed by closing the document | Untested |
| Stop capture from the browser side / lose the offscreen document | No false "active capture" status and no automatic reuse of the old ID | Untested |
| Update/reload the extension from old WindowMod | Old session data cleared, settings preserved, new mode starts explicitly | Untested |
| Ordinary mode and whitelist after migration | Existing enable/autostart scenarios still work | Untested |
| Close the popup while the spectrum is shown | Spectrum frame relay stops; audio keeps playing | Untested |
| Select capture A from the popup on browser tab B; stop A, then let A also end externally | Settings and spectrum refer to B, not to the stopped/ended capture | Untested — real audio/tab-capture interaction cannot be executed from the automated WSL environment |
| Capture → toggle bypass off (EQ disabled) → repeated Start | EQ stays disabled in the audio graph, button, and badge; capture keeps playing; a subsequent toggle is consistent | Untested — real audio/tab-capture interaction cannot be executed from the automated WSL environment |
| Failed Start → successful retry → close/reopen the popup | The old error message is gone after the successful start | Untested — real audio/tab-capture interaction cannot be executed from the automated WSL environment |
| Capture with bypass → terminate the service worker → trigger a page graph event (e.g. change the number of EQ points) | Badge keeps the capture state across the worker restart; after Stop the normal EQ controls the badge again | Untested — real audio/tab-capture interaction cannot be executed from the automated WSL environment |

## Protocol and edge checks

These were carried over from earlier reviews and are not yet confirmed by unit tests.

- [ ] (a) Verify the real-Chrome `sender.url` shape for offscreen senders against the
  guards in `background.ts` (`isOffscreenSender`) and `offscreen.ts`; confirm the frame
  branch actually accepts the message and that a same-extension content sender does not.
- [ ] (b) Verify that the offscreen engine reply always satisfies the background
  `isCaptureReply` check (start/stop/list), including error replies.
- [ ] (c) Send a message immediately after `chrome.offscreen.createDocument()` resolves
  and confirm it reaches the offscreen listener (no race before the document is ready).
- [ ] (d) Exercise the iframe-during-capture flow: the content script re-resolves its
  capture state via `IS_TOOLKIT_CAPTURED` and does not start a second EQ in the frame.
- [ ] (e) Chrome 130 minimum-version check. If Chrome 130 is unavailable, mark this
  item **untested** and state the version actually used.

## Recording

Automated gate (2026-09-27, agent run, worktree `.worktrees/offscreen-tab-capture-v2`,
commit `baed268` after the four review fixes: popup spectrum fallback switching,
confirmed bypass state on repeated start, stale error clearing after successful
start, snapshot-based capture-badge ownership across worker restarts):

- `npm run format:check` — exit 0
- `npm run lint` — exit 0
- `npm run typecheck` — exit 0
- `npm test` — 67 files / 369 tests passed, 0 failed
- `npm run lint:locales` — exit 0, 19 locales validated
- `npm run build` — exit 0; `dist/offscreen.html` and `dist/scripts/offscreen.js` present
- `git diff --check` — exit 0

Manual Chrome run:

- Chrome version: present on the Windows host but untested — real audio/tab-capture
  interaction cannot be executed from the automated WSL environment
- Extension build/commit: `baed268` (fix: preserve capture badge ownership across
  worker restarts)
- Date and tester: 2026-09-27, automated agent — **browser scenarios pending manual run**
- Failures (scenario, observed, console output): browser matrix untested — every
  row above is pending manual verification, including the four repeated-capture
  re-review scenarios; do not treat "Untested" as PASS
