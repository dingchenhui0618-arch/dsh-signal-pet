# Changelog

## 0.1.0

- Frame-wide pet on the `shell.overlay` slot, driven by real harness events
  rather than client-side guessing: `agent/status`, `tools/pre-execute`,
  `tools/result`, `agent/error`, `agent/turn-stopping`.
- Five states with a deliberate priority: an error outranks tool work, tool work
  outranks thinking, thinking outranks a celebration. An error stays visible for
  `errorTtlMs` before the pet falls back to what is happening now.
- Tethers: one flowing line per running tool, capped by `maxTethers`.
- Completion celebration for turns that ran at least `celebrateAfterMs`.
- Placement avoids the composer and the focused input using
  `getBoundingClientRect`, trying five candidate corners and falling back to the
  least-overlapped one with an explicit `vp-blocked` class.
- `prefers-reduced-motion: reduce` degrades to a static badge that keeps the
  status colour and text label.
- `data-pet-state` and `data-pet-mode` on the DOM for screenshot verification.
- Click to collapse, remembered in `localStorage`.
- `POST /dsh-signal-pet/pulse` forces a celebration so the animation can be
  verified without waiting for a long job.
