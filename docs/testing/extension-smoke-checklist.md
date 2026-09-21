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

| Scenario | Expected result |
| --- | --- |
| Start → close popup → reopen | No extra window; audio and settings preserved |
| Pause for 60 seconds, then Play | Session still exists; audio resumes |
| Minimize browser / switch to another tab | Capture keeps processing |
| Terminate the service worker, then open the popup | Offscreen kept playing; state restored without a new capture |
| Capture A and B; disable EQ A; stop A | B is unaffected; bypassing A is not the same as stopping it |
| Change mute/gain/EQ shortcuts with the UI closed | One command changes exactly the intended tab |
| Start from an active ordinary EQ; change mute/gain | No double processing, no extra gain, no stuck mute |
| Reload/redirect the captured tab; create an iframe | Stream is preserved and a second EQ is prevented; on `ended` the UI clears the capture |
| tabCapture / getUserMedia denial / tab closed during start | Clear error or correct cancellation, resources released, other tabs keep working |
| Stop the last tab at the same time as starting a new one | The live new stream is not killed by closing the document |
| Stop capture from the browser side / lose the offscreen document | No false "active capture" status and no automatic reuse of the old ID |
| Update/reload the extension from old WindowMod | Old session data cleared, settings preserved, new mode starts explicitly |
| Ordinary mode and whitelist after migration | Existing enable/autostart scenarios still work |
| Close the popup while the spectrum is shown | Spectrum frame relay stops; audio keeps playing |

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

- Chrome version:
- Extension build/commit:
- Date and tester:
- Failures (scenario, observed, console output):
