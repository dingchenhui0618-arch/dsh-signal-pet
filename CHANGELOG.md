# Changelog

## [Unreleased]

### 文档与工程

- 新增 `SECURITY.md`：信任边界、事件流里哪些字段被记录、HTTP 面现状、已知限制与漏洞报告渠道。
- 新增 `.github/workflows/ci.yml`：ubuntu + windows × node 22/24，跑 build、`lib/` 一致性、单测；`publish.yml` 未改动。
- README 顶部加 CI / license badge 与 star 引导。

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
