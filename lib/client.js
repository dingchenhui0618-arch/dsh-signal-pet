/* dsh-signal-pet client bundle — generated from src/client.cjs */
window.__ModuleLoader__.load({
  id: "dsh-signal-pet",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
// Client half of dsh-signal-pet: a frame-wide pet that reports what the harness
// is doing.
//
// Must stay CommonJS — the build wraps this in window.__ModuleLoader__.load()
// and React is supplied by the harness.
//
// It mounts on `shell.overlay`, the frame-wide floating layer that sits above
// every column and outside their scroll containers. That layer is click-through
// by design, so the pet opts back into pointer events on itself and nothing
// else: a full-frame overlay that swallowed clicks would be a worse bug than any
// animation is a feature.
//
// The pet renders a state it did not compute. Every fact comes from
// GET /dsh-signal-pet, which the host folds from real harness events, so the pet
// and the endpoint cannot disagree about whether something is wrong.

const React = require('react')
const h = React.createElement
const CSS = ".vp-layer{position:fixed;inset:0;pointer-events:none;z-index:40;overflow:hidden}.vp-pet{position:absolute;pointer-events:auto;cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px;transition:left 320ms ease,top 320ms ease}.vp-body{position:relative;width:64px;height:64px;display:grid;place-items:center;border-radius:50%;border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:color-mix(in srgb,currentColor 7%,transparent);backdrop-filter:blur(6px)}.vp-eye{position:absolute;top:22px;width:9px;height:9px;border-radius:50%;background:currentColor}.vp-eye.vp-l{left:16px}.vp-eye.vp-r{right:16px}.vp-mouth{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);width:16px;height:2px;border-radius:2px;background:color-mix(in srgb,currentColor 55%,transparent)}.vp-ring{position:absolute;inset:-4px;border-radius:50%;border:2px solid transparent}.vp-pet[data-pet-state=\"idle\"] .vp-ring{border-color:color-mix(in srgb,currentColor 16%,transparent)}.vp-pet[data-pet-state=\"thinking\"] .vp-ring{border-color:color-mix(in srgb,#0284c7 55%,transparent)}.vp-pet[data-pet-state=\"working\"] .vp-ring{border-color:color-mix(in srgb,#7c3aed 60%,transparent)}.vp-pet[data-pet-state=\"error\"] .vp-ring{border-color:color-mix(in srgb,#dc2626 70%,transparent)}.vp-pet[data-pet-state=\"celebrate\"] .vp-ring{border-color:color-mix(in srgb,#16a34a 70%,transparent)}.vp-label{font-size:11px;line-height:1.3;padding:3px 8px;border-radius:999px;white-space:nowrap;border:1px solid color-mix(in srgb,currentColor 16%,transparent);background:color-mix(in srgb,currentColor 8%,transparent);backdrop-filter:blur(6px)}.vp-pet[data-pet-state=\"error\"] .vp-label{border-color:color-mix(in srgb,#dc2626 50%,transparent);color:color-mix(in srgb,#dc2626 82%,currentColor)}.vp-pet[data-pet-state=\"celebrate\"] .vp-label{border-color:color-mix(in srgb,#16a34a 50%,transparent);color:color-mix(in srgb,#16a34a 80%,currentColor)}.vp-anim-idle .vp-body{animation:vp-float 2600ms ease-in-out infinite}.vp-anim-thinking .vp-body{animation:vp-float 780ms ease-in-out infinite}.vp-anim-working .vp-body{animation:vp-float 1100ms ease-in-out infinite}.vp-anim-error .vp-body{animation:vp-shake 260ms ease-in-out 5}.vp-anim-celebrate .vp-body{animation:vp-cheer 620ms cubic-bezier(.3,1.6,.4,1) 4}@keyframes vp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}@keyframes vp-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}@keyframes vp-cheer{0%{transform:translateY(0) scale(1)}35%{transform:translateY(-22px) scale(1.14)}100%{transform:translateY(0) scale(1)}}.vp-tethers{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}.vp-tether{fill:none;stroke:color-mix(in srgb,#7c3aed 60%,transparent);stroke-width:1.5;stroke-linecap:round;stroke-dasharray:6 7;animation:vp-flow 900ms linear infinite}@keyframes vp-flow{to{stroke-dashoffset:-26}}.vp-spark{position:absolute;width:6px;height:6px;border-radius:50%;background:color-mix(in srgb,#16a34a 75%,transparent)}.vp-spark.vp-s1{animation:vp-spark 620ms ease-out 4}.vp-spark.vp-s2{animation:vp-spark 620ms ease-out 120ms 4}.vp-spark.vp-s3{animation:vp-spark 620ms ease-out 240ms 4}@keyframes vp-spark{0%{transform:translate(0,0) scale(.4);opacity:1}100%{transform:translate(var(--vp-dx,14px),var(--vp-dy,-26px)) scale(.2);opacity:0}}.vp-static .vp-body,.vp-static .vp-label,.vp-static .vp-spark,.vp-static .vp-tether{animation:none!important}.vp-static .vp-body{width:22px;height:22px}.vp-static .vp-eye,.vp-static .vp-mouth{display:none}.vp-static .vp-pet{gap:6px}.vp-collapsed .vp-label{display:none}.vp-collapsed .vp-body{width:26px;height:26px}.vp-collapsed .vp-eye,.vp-collapsed .vp-mouth{display:none}"

const API = '/dsh-signal-pet'
const POLL_MS = 700
const RELAYOUT_MS = 1500
const STORAGE_KEY = 'dsh-signal-pet.collapsed'
const PET_SIZE = { width: 64, height: 64 }

// Anything that is plausibly "the composer": focusable text surfaces plus an
// explicit escape hatch other plugins or the user can opt into. Matching on
// behaviour instead of on DSH class names is what keeps this from breaking the
// next time the UI is restyled.
const OBSTACLE_SELECTOR = [
  'textarea',
  'input',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[data-pet-avoid]',
].join(',')

const PHASE_LABELS = {
  idle: '空闲',
  thinking: '思考中',
  working: '执行中',
  error: '出错了',
  celebrate: '完成',
}

// ---------------------------------------------------------------- pure helpers
//
// These four are the parts worth pinning with tests: overlap maths and the
// reduced-motion decision. They are pure so they can be, and they are exported
// through __test rather than living in the component where neither would be
// reachable without a DOM.

function intersects(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

function overlapArea(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (width <= 0 || height <= 0) return 0
  return width * height
}

/**
 * Choose where the pet sits.
 *
 * The pet has to avoid the composer and whatever input currently has focus — a
 * pet parked over the box you are typing in is the difference between a
 * decoration and an obstruction. Candidate corners are tried in order and the
 * first one that clears every obstacle wins; if none is clear, the least
 * overlapped one is used and `clear: false` says so, which is what the caller
 * needs to know to dim the pet instead of pretending it got out of the way.
 *
 * @param {{width:number,height:number}} viewport
 * @param {Array<{x:number,y:number,width:number,height:number}>} obstacles
 * @param {{width:number,height:number}} size
 * @param {{margin?:number, gap?:number}} [options]
 * @returns {{side:string,x:number,y:number,clear:boolean,overlap:number}}
 */
function pickPosition(viewport, obstacles, size, options) {
  const opts = options || {}
  const margin = Number.isFinite(opts.margin) ? opts.margin : 16
  // Obstacles are grown by the gap before testing, so "clear" means "clear with
  // breathing room" rather than "not literally overlapping".
  const gap = Number.isFinite(opts.gap) ? opts.gap : 10
  const list = Array.isArray(obstacles) ? obstacles : []

  const right = viewport.width - size.width - margin
  const bottom = viewport.height - size.height - margin
  const centre = Math.max(margin, Math.round((viewport.width - size.width) / 2))

  const candidates = [
    { side: 'bottom-right', x: right, y: bottom },
    { side: 'top-right', x: right, y: margin },
    { side: 'bottom-left', x: margin, y: bottom },
    { side: 'top-left', x: margin, y: margin },
    { side: 'top-centre', x: centre, y: margin },
  ]

  const grown = list.map(function (rect) {
    return { x: rect.x - gap, y: rect.y - gap, width: rect.width + gap * 2, height: rect.height + gap * 2 }
  })

  let best
  for (const candidate of candidates) {
    const box = {
      x: Math.max(margin, Math.min(candidate.x, Math.max(margin, viewport.width - size.width - margin))),
      y: Math.max(margin, Math.min(candidate.y, Math.max(margin, viewport.height - size.height - margin))),
      width: size.width,
      height: size.height,
    }
    let overlap = 0
    for (const rect of grown) {
      if (intersects(box, rect)) overlap += overlapArea(box, rect)
    }
    const entry = { side: candidate.side, x: Math.round(box.x), y: Math.round(box.y), clear: overlap === 0, overlap: overlap }
    if (best === undefined || entry.overlap < best.overlap) best = entry
    if (entry.clear) return entry
  }
  return best
}

/**
 * Animated or static.
 *
 * Reduced motion is not "animate less" — the pointer still has to convey the
 * state. So the static form keeps the ring colour and the text label and drops
 * every keyframe.
 */
function motionMode(reducedMotion, collapsed) {
  if (reducedMotion) return 'static'
  return collapsed ? 'collapsed' : 'animated'
}

function phaseLabel(phase) {
  return PHASE_LABELS[phase] === undefined ? PHASE_LABELS.idle : PHASE_LABELS[phase]
}

function humanMs(ms) {
  const value = Number.isFinite(ms) ? ms : 0
  if (value < 1000) return Math.round(value) + 'ms'
  if (value < 60000) return (value / 1000).toFixed(1) + 's'
  return Math.round(value / 60000) + 'min'
}

// ------------------------------------------------------------------ DOM probes

function rectOf(element) {
  if (element === undefined || element === null) return undefined
  if (typeof element.getBoundingClientRect !== 'function') return undefined
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return undefined
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

/** Visible obstacles: the focused element, plus anything composer-shaped. */
function obstaclesOf(doc) {
  const found = []
  const seen = new Set()
  const active = doc.activeElement
  const activeRect = rectOf(active)
  if (activeRect !== undefined) {
    found.push(activeRect)
    seen.add(active)
  }
  let matched = []
  try {
    matched = Array.from(doc.querySelectorAll(OBSTACLE_SELECTOR))
  } catch (error) {
    matched = []
  }
  for (const element of matched) {
    if (seen.has(element)) continue
    const rect = rectOf(element)
    if (rect === undefined) continue
    // Only surfaces big enough to be a composer; a stray 1x1 input somewhere
    // should not push the pet into a corner.
    if (rect.width < 80 || rect.height < 18) continue
    found.push(rect)
    seen.add(element)
  }
  return found
}

function reducedMotionOf(win) {
  try {
    if (win !== undefined && win.matchMedia) {
      return win.matchMedia('(prefers-reduced-motion: reduce)').matches === true
    }
  } catch (error) {
    return false
  }
  return false
}

// ------------------------------------------------------------------- the store

let snap = { data: null, error: '', at: 0 }
const listeners = new Set()
let timer = null

function emit() {
  Array.from(listeners).forEach(function (fn) {
    try {
      fn(snap)
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-signal-pet] listener failed', error)
    }
  })
}

function load() {
  fetch(API, { headers: { accept: 'application/json' } })
    .then(function (res) { return res.json() })
    .then(function (data) {
      snap = { data: data, error: '', at: Date.now() }
      emit()
    })
    .catch(function (error) {
      snap = { data: snap.data, error: String((error && error.message) || error), at: Date.now() }
      emit()
    })
}

function subscribe(fn) {
  listeners.add(fn)
  if (timer === null) {
    timer = setInterval(load, POLL_MS)
    load()
  }
  return function () {
    listeners.delete(fn)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

function useSnap() {
  const [value, setValue] = React.useState(snap)
  React.useEffect(function () { return subscribe(setValue) }, [])
  return value
}

function useStored(key, initial) {
  const [value, setValue] = React.useState(function () {
    try {
      if (typeof localStorage === 'undefined') return initial
      const raw = localStorage.getItem(key)
      return raw === null ? initial : raw === 'true'
    } catch (error) {
      return initial
    }
  })
  const write = React.useCallback(function (next) {
    setValue(next)
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, next ? 'true' : 'false')
    } catch (error) {
      // A blocked storage key must not break the pet.
    }
  }, [])
  return [value, write]
}

function useLayout(size) {
  const [layout, setLayout] = React.useState({ position: null, reducedMotion: false })

  React.useEffect(function () {
    let frame = null
    const measure = function () {
      frame = null
      const win = typeof window === 'undefined' ? undefined : window
      const doc = typeof document === 'undefined' ? undefined : document
      if (win === undefined || doc === undefined) return
      const viewport = { width: win.innerWidth || 0, height: win.innerHeight || 0 }
      if (viewport.width === 0 || viewport.height === 0) return
      const position = pickPosition(viewport, obstaclesOf(doc), size, { margin: 16, gap: 10 })
      const reducedMotion = reducedMotionOf(win)
      setLayout(function (previous) {
        const same = previous.position !== null &&
          previous.position.side === position.side &&
          previous.position.x === position.x &&
          previous.position.y === position.y &&
          previous.position.clear === position.clear &&
          previous.reducedMotion === reducedMotion
        return same ? previous : { position: position, reducedMotion: reducedMotion }
      })
    }
    const schedule = function () {
      if (frame !== null) return
      frame = requestAnimationFrame(measure)
    }

    measure()
    const interval = setInterval(measure, RELAYOUT_MS)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('focusin', schedule)
    window.addEventListener('focusout', schedule)
    return function () {
      clearInterval(interval)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('focusin', schedule)
      window.removeEventListener('focusout', schedule)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [size])

  return layout
}

// --------------------------------------------------------------- the pet itself

function Tethers(props) {
  if (props.count <= 0) return null
  const from = { x: props.origin.x, y: props.origin.y }
  const lines = []
  for (let i = 0; i < props.count; i += 1) {
    // Fan the lines out so three tools look like three tools, not one thick one.
    const spread = props.count === 1 ? 0 : (i - (props.count - 1) / 2) * 42
    lines.push(h('path', {
      key: i,
      className: 'vp-tether',
      d: 'M ' + from.x + ' ' + from.y +
        ' C ' + (from.x + spread) + ' ' + (from.y + (props.to.y - from.y) * 0.45) +
        ' ' + (props.to.x + spread) + ' ' + (from.y + (props.to.y - from.y) * 0.75) +
        ' ' + (props.to.x + spread) + ' ' + props.to.y,
    }))
  }
  return h('svg', { className: 'vp-tethers', 'aria-hidden': 'true' }, lines)
}

function Pet(props) {
  const state = useSnap()
  const [collapsed, setCollapsed] = useStored(STORAGE_KEY, false)
  const layout = useLayout(PET_SIZE)
  const data = state.data || {}
  const phase = typeof data.phase === 'string' && PHASE_LABELS[data.phase] !== undefined ? data.phase : 'idle'
  const mode = motionMode(layout.reducedMotion, collapsed)
  const position = layout.position

  const label = phaseLabel(phase)
  const detail = []
  if (phase === 'working' && data.toolsRunning > 0) detail.push(data.toolsRunning + ' 个工具')
  if (phase === 'thinking' && data.busyMs > 0) detail.push(humanMs(data.busyMs))
  if (phase === 'celebrate' && data.celebrateMs) detail.push(humanMs(data.celebrateMs))
  if (phase === 'error' && data.error) detail.push(String(data.error.message || '').slice(0, 60))
  if (phase === 'idle' && state.error) detail.push('连接失败')

  const title = [
    label,
    data.lastTool ? '最近工具 ' + data.lastTool.name : '',
    data.toolsTotal ? '共 ' + data.toolsTotal + ' 次工具调用' : '',
  ].filter(function (part) { return part.length > 0 }).join(' · ')

  const className = [
    'vp-pet',
    'vp-anim-' + phase,
    mode === 'static' ? 'vp-static' : '',
    collapsed ? 'vp-collapsed' : '',
    position !== null && position.clear === false ? 'vp-blocked' : '',
  ].filter(function (part) { return part.length > 0 }).join(' ')

  const style = position === null
    ? { left: '0px', top: '0px', visibility: 'hidden' }
    : { left: position.x + 'px', top: position.y + 'px' }

  return h('div', { className: 'vp-layer', 'data-pet-state': phase, 'data-pet-mode': mode },
    position !== null && data.tethers > 0 && mode === 'animated'
      ? h(Tethers, {
        count: data.tethers,
        origin: { x: position.x + PET_SIZE.width / 2, y: position.y + PET_SIZE.height },
        to: { x: typeof window === 'undefined' ? 0 : window.innerWidth / 2, y: typeof window === 'undefined' ? 0 : window.innerHeight - 24 },
      })
      : null,
    h('div', {
      className: className,
      style: style,
      title: title,
      'data-pet-state': phase,
      onClick: function () { setCollapsed(!collapsed) },
    },
      h('div', { className: 'vp-body' },
        h('div', { className: 'vp-ring' }),
        h('div', { className: 'vp-eye vp-l' }),
        h('div', { className: 'vp-eye vp-r' }),
        h('div', { className: 'vp-mouth' }),
        phase === 'celebrate'
          ? [
            h('div', { key: 's1', className: 'vp-spark vp-s1', style: { '--vp-dx': '-18px', '--vp-dy': '-30px' } }),
            h('div', { key: 's2', className: 'vp-spark vp-s2', style: { '--vp-dx': '2px', '--vp-dy': '-38px' } }),
            h('div', { key: 's3', className: 'vp-spark vp-s3', style: { '--vp-dx': '20px', '--vp-dy': '-28px' } }),
          ]
          : null,
      ),
      h('div', { className: 'vp-label' }, detail.length > 0 ? label + ' · ' + detail.join(' · ') : label),
    ),
  )
}

function apply(ctx) {
  // dsh can unload a plugin at runtime, so every registration has a teardown.
  // The shared poll outlives one apply(), so it gets its own disposer.
  ctx.effect(function () {
    return function () {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      listeners.clear()
      snap = { data: null, error: '', at: 0 }
    }
  })

  ctx.effect(function () {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-signal-pet'
    style.textContent = CSS
    document.head.appendChild(style)
    return function () { style.remove() }
  })

  // Guarded and normalised: a changed slot contract must degrade this one
  // overlay and say so, not abort the client boot for every other plugin.
  ctx.slots.inject('shell.overlay', function () {
    let dispose
    try {
      dispose = ctx.slots.register(
        { name: 'shell.overlay', id: 'signal-pet', order: 60, label: '状态宠物' },
        Pet,
      )
    } catch (error) {
      dispose = undefined
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[dsh-signal-pet] could not register the overlay', error)
      }
    }
    return typeof dispose === 'function' ? dispose : function () {}
  })
}

module.exports = {
  name: 'dsh-signal-pet',
  inject: ['slots'],
  apply: apply,
  // Test seam: the overlap maths and the reduced-motion decision are the parts
  // that rot silently, and neither needs a DOM to verify.
  __test: {
    intersects: intersects,
    overlapArea: overlapArea,
    pickPosition: pickPosition,
    motionMode: motionMode,
    phaseLabel: phaseLabel,
    humanMs: humanMs,
    OBSTACLE_SELECTOR: OBSTACLE_SELECTOR,
  },
}
    return module.exports;
  },
});
