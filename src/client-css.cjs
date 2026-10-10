// Client styles for dsh-signal-pet.
//
// The layer itself is click-through; only the pet opts back into pointer events,
// so a full-frame overlay never steals a click from the app underneath.
//
// Colours are built with color-mix() against currentColor plus low-alpha status
// accents, so the pet inherits the host theme instead of fighting it. There is
// no hard-coded surface colour anywhere.

module.exports = [
  '.vp-layer{position:fixed;inset:0;pointer-events:none;z-index:40;overflow:hidden}',
  '.vp-pet{position:absolute;pointer-events:auto;cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px;transition:left 320ms ease,top 320ms ease}',
  '.vp-body{position:relative;width:64px;height:64px;display:grid;place-items:center;border-radius:50%;',
  'border:1px solid color-mix(in srgb,currentColor 18%,transparent);',
  'background:color-mix(in srgb,currentColor 7%,transparent);',
  'backdrop-filter:blur(6px)}',
  '.vp-eye{position:absolute;top:22px;width:9px;height:9px;border-radius:50%;background:currentColor}',
  '.vp-eye.vp-l{left:16px}',
  '.vp-eye.vp-r{right:16px}',
  '.vp-mouth{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);width:16px;height:2px;border-radius:2px;background:color-mix(in srgb,currentColor 55%,transparent)}',

  // Status is carried by a ring, not by recolouring the whole body: readable in
  // both themes, and it keeps the pet recognisable as the same pet.
  '.vp-ring{position:absolute;inset:-4px;border-radius:50%;border:2px solid transparent}',
  '.vp-pet[data-pet-state="idle"] .vp-ring{border-color:color-mix(in srgb,currentColor 16%,transparent)}',
  '.vp-pet[data-pet-state="thinking"] .vp-ring{border-color:color-mix(in srgb,#0284c7 55%,transparent)}',
  '.vp-pet[data-pet-state="working"] .vp-ring{border-color:color-mix(in srgb,#7c3aed 60%,transparent)}',
  '.vp-pet[data-pet-state="error"] .vp-ring{border-color:color-mix(in srgb,#dc2626 70%,transparent)}',
  '.vp-pet[data-pet-state="celebrate"] .vp-ring{border-color:color-mix(in srgb,#16a34a 70%,transparent)}',

  '.vp-label{font-size:11px;line-height:1.3;padding:3px 8px;border-radius:999px;white-space:nowrap;',
  'border:1px solid color-mix(in srgb,currentColor 16%,transparent);',
  'background:color-mix(in srgb,currentColor 8%,transparent);backdrop-filter:blur(6px)}',
  '.vp-pet[data-pet-state="error"] .vp-label{border-color:color-mix(in srgb,#dc2626 50%,transparent);color:color-mix(in srgb,#dc2626 82%,currentColor)}',
  '.vp-pet[data-pet-state="celebrate"] .vp-label{border-color:color-mix(in srgb,#16a34a 50%,transparent);color:color-mix(in srgb,#16a34a 80%,currentColor)}',

  // Idle drifts slowly; thinking speeds the same motion up, so "busy" reads as
  // the same pet moving faster rather than as a different widget.
  '.vp-anim-idle .vp-body{animation:vp-float 2600ms ease-in-out infinite}',
  '.vp-anim-thinking .vp-body{animation:vp-float 780ms ease-in-out infinite}',
  '.vp-anim-working .vp-body{animation:vp-float 1100ms ease-in-out infinite}',
  '.vp-anim-error .vp-body{animation:vp-shake 260ms ease-in-out 5}',
  '.vp-anim-celebrate .vp-body{animation:vp-cheer 620ms cubic-bezier(.3,1.6,.4,1) 4}',

  '@keyframes vp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}',
  '@keyframes vp-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}',
  '@keyframes vp-cheer{0%{transform:translateY(0) scale(1)}35%{transform:translateY(-22px) scale(1.14)}100%{transform:translateY(0) scale(1)}}',

  '.vp-tethers{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}',
  '.vp-tether{fill:none;stroke:color-mix(in srgb,#7c3aed 60%,transparent);stroke-width:1.5;stroke-linecap:round;stroke-dasharray:6 7;animation:vp-flow 900ms linear infinite}',
  '@keyframes vp-flow{to{stroke-dashoffset:-26}}',

  '.vp-spark{position:absolute;width:6px;height:6px;border-radius:50%;background:color-mix(in srgb,#16a34a 75%,transparent)}',
  '.vp-spark.vp-s1{animation:vp-spark 620ms ease-out 4}',
  '.vp-spark.vp-s2{animation:vp-spark 620ms ease-out 120ms 4}',
  '.vp-spark.vp-s3{animation:vp-spark 620ms ease-out 240ms 4}',
  '@keyframes vp-spark{0%{transform:translate(0,0) scale(.4);opacity:1}100%{transform:translate(var(--vp-dx,14px),var(--vp-dy,-26px)) scale(.2);opacity:0}}',

  // Reduced motion: no keyframes at all, and the pet becomes a small static
  // badge that still carries the state in its ring colour and its label text.
  '.vp-static .vp-body,.vp-static .vp-label,.vp-static .vp-spark,.vp-static .vp-tether{animation:none!important}',
  '.vp-static .vp-body{width:22px;height:22px}',
  '.vp-static .vp-eye,.vp-static .vp-mouth{display:none}',
  '.vp-static .vp-pet{gap:6px}',
  '.vp-collapsed .vp-label{display:none}',
  '.vp-collapsed .vp-body{width:26px;height:26px}',
  '.vp-collapsed .vp-eye,.vp-collapsed .vp-mouth{display:none}',
].join('')
