// The client half is CommonJS and expects the harness to supply React, so it is
// loaded here with React and the browser globals stubbed. Everything else under
// test is the real module the browser runs.
//
// Two levels are checked. The pure helpers (placement, reduced-motion choice)
// need no DOM and are the parts that rot silently. The render tests go further
// and call the registered component, because the two things this plugin promises
// to a screenshot check — `data-pet-state` and the reduced-motion downgrade —
// are only observable in the rendered tree, and "it looked fine" is exactly how
// a broken indicator survives.
import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import Module from 'node:module'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// ------------------------------------------------------------- stubs, up front
//
// createElement builds a real tree so a render can be walked. useState retains
// values by hook index, because the component stores its measured layout there —
// a stateless stub would silently render the pre-measurement state and every
// position assertion would pass against nothing. useEffect runs its body and
// records the cleanup, which is what lets a render be driven outside React.

let effectCleanups = []
let slots = []
let slotIndex = 0

const React = {
  createElement: function (type, props) {
    const children = Array.prototype.slice.call(arguments, 2)
    return { type: type, props: props || {}, children: children }
  },
  useState: function (initial) {
    const index = slotIndex
    slotIndex += 1
    if (slots.length <= index) {
      slots[index] = typeof initial === 'function' ? initial() : initial
    }
    return [slots[index], function (next) {
      slots[index] = typeof next === 'function' ? next(slots[index]) : next
    }]
  },
  useEffect: function (fn) {
    const cleanupFn = fn()
    if (typeof cleanupFn === 'function') effectCleanups.push(cleanupFn)
  },
  useCallback: function (fn) { return fn },
}

const originalRequire = Module.prototype.require
Module.prototype.require = function (id) {
  if (id === 'react') return React
  return originalRequire.apply(this, arguments)
}

// The browser surface the client touches. Kept minimal and honest: only what the
// module actually calls, so an accidental new dependency on the DOM shows up as
// a thrown error here rather than as a silent no-op.
const domListeners = new Map()
let fetched = null

global.window = {
  innerWidth: 1200,
  innerHeight: 800,
  addEventListener: function (name, fn) {
    if (!domListeners.has(name)) domListeners.set(name, [])
    domListeners.get(name).push(fn)
  },
  removeEventListener: function (name, fn) {
    const list = domListeners.get(name) || []
    const at = list.indexOf(fn)
    if (at >= 0) list.splice(at, 1)
  },
  matchMedia: function () { return { matches: global.__reducedMotion === true } },
}
global.document = {
  activeElement: null,
  createElement: function () { return { dataset: {}, remove: function () {} } },
  head: { appendChild: function () {} },
  querySelectorAll: function () { return [] },
}
global.requestAnimationFrame = function (fn) { fn(); return 0 }
global.cancelAnimationFrame = function () {}
global.localStorage = {
  store: {},
  getItem: function (key) { return this.store[key] === undefined ? null : this.store[key] },
  setItem: function (key, value) { this.store[key] = String(value) },
}
global.fetch = function () {
  return Promise.resolve({ json: function () { return Promise.resolve(fetched) } })
}

const client = require('../src/client.cjs')
Module.prototype.require = originalRequire

const { pickPosition, motionMode, phaseLabel, humanMs, intersects, overlapArea } = client.__test
const SIZE = { width: 64, height: 64 }
const VIEWPORT = { width: 1200, height: 800 }

// ------------------------------------------------------------------ pure tests

test('the client half exports the cordis contract the harness reads', () => {
  assert.equal(client.name, 'dsh-signal-pet')
  assert.deepEqual(client.inject, ['slots'])
  assert.equal(typeof client.apply, 'function')
})

test('overlap maths is exact', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 }
  assert.equal(intersects(a, { x: 5, y: 5, width: 10, height: 10 }), true)
  assert.equal(intersects(a, { x: 10, y: 0, width: 5, height: 5 }), false, 'touching edges do not intersect')
  assert.equal(overlapArea(a, { x: 5, y: 5, width: 10, height: 10 }), 25)
  assert.equal(overlapArea(a, { x: 20, y: 20, width: 10, height: 10 }), 0)
})

test('with nothing in the way the pet rests in the bottom-right', () => {
  const spot = pickPosition(VIEWPORT, [], SIZE)
  assert.equal(spot.clear, true)
  assert.equal(spot.side, 'bottom-right')
  assert.equal(spot.x, 1200 - 64 - 16)
  assert.equal(spot.y, 800 - 64 - 16)
})

test('a composer across the bottom pushes the pet out of it', () => {
  const composer = [{ x: 0, y: 700, width: 1200, height: 100 }]
  const spot = pickPosition(VIEWPORT, composer, SIZE)
  assert.equal(spot.clear, true)
  assert.equal(spot.side, 'top-right')
  assert.ok(spot.y + SIZE.height <= 700, 'the pet sits above the composer')
})

test('a composer only in the corner still leaves the other corner usable', () => {
  const composer = [{ x: 900, y: 700, width: 300, height: 100 }]
  const spot = pickPosition(VIEWPORT, composer, SIZE)
  assert.equal(spot.clear, true)
  const box = { x: spot.x, y: spot.y, width: SIZE.width, height: SIZE.height }
  assert.equal(intersects(box, { x: 890, y: 690, width: 320, height: 120 }), false)
})

test('the focused input is avoided even when nothing else is', () => {
  // The case that matters: a pet over the box you are typing in is an
  // obstruction, not a decoration.
  const focused = [{ x: 1000, y: 600, width: 200, height: 60 }]
  const spot = pickPosition(VIEWPORT, focused, SIZE)
  const box = { x: spot.x, y: spot.y, width: SIZE.width, height: SIZE.height }
  assert.equal(intersects(box, { x: 990, y: 590, width: 220, height: 80 }), false)
  assert.equal(spot.clear, true)
})

test('clearing an obstacle means clearing it with a gap, not merely touching it', () => {
  const beside = [{ x: 800, y: 700, width: 336, height: 84 }]
  const spot = pickPosition(VIEWPORT, beside, SIZE)
  const box = { x: spot.x, y: spot.y, width: SIZE.width, height: SIZE.height }
  assert.equal(intersects(box, { x: 790, y: 690, width: 356, height: 104 }), false)
})

test('when every corner is blocked the pet takes the least bad one and says so', () => {
  const everything = [
    { x: 0, y: 0, width: 600, height: 400 },
    { x: 600, y: 0, width: 600, height: 400 },
    { x: 0, y: 400, width: 600, height: 400 },
    { x: 600, y: 400, width: 600, height: 400 },
  ]
  const spot = pickPosition(VIEWPORT, everything, SIZE)
  assert.equal(spot.clear, false)
  assert.ok(spot.overlap > 0)
  assert.ok(spot.x >= 16 && spot.y >= 16)
  assert.ok(spot.x + SIZE.width <= VIEWPORT.width && spot.y + SIZE.height <= VIEWPORT.height)
})

test('the pet stays inside a viewport smaller than itself', () => {
  const spot = pickPosition({ width: 40, height: 40 }, [], SIZE)
  assert.equal(spot.x, 16)
  assert.equal(spot.y, 16)
})

test('a zero-sized viewport does not produce NaN coordinates', () => {
  const spot = pickPosition({ width: 0, height: 0 }, [], SIZE)
  assert.ok(Number.isFinite(spot.x))
  assert.ok(Number.isFinite(spot.y))
})

test('reduced motion degrades to a static badge, not a quieter animation', () => {
  assert.equal(motionMode(true, false), 'static')
  assert.equal(motionMode(true, true), 'static')
  assert.equal(motionMode(false, false), 'animated')
  assert.equal(motionMode(false, true), 'collapsed')
})

test('phase labels cover every phase the host can report', () => {
  for (const phase of ['idle', 'thinking', 'working', 'error', 'celebrate']) {
    assert.equal(typeof phaseLabel(phase), 'string')
    assert.ok(phaseLabel(phase).length > 0)
  }
  assert.equal(phaseLabel('nonsense'), '空闲', 'an unknown phase must not render as undefined')
  assert.equal(phaseLabel(undefined), '空闲')
})

test('durations read as durations', () => {
  assert.equal(humanMs(0), '0ms')
  assert.equal(humanMs(950), '950ms')
  assert.equal(humanMs(1500), '1.5s')
  assert.equal(humanMs(59_000), '59.0s')
  assert.equal(humanMs(125_000), '2min')
  assert.equal(humanMs(undefined), '0ms')
  assert.equal(humanMs(NaN), '0ms')
})

test('the obstacle selector targets behaviour, not DSH class names', () => {
  const selector = client.__test.OBSTACLE_SELECTOR
  assert.ok(selector.includes('textarea'))
  assert.ok(selector.includes('contenteditable'))
  assert.ok(selector.includes('role="textbox"'))
  assert.ok(selector.includes('data-pet-avoid'))
})

// --------------------------------------------------------------- render tests

function capture() {
  const registered = []
  const ctx = {
    effect: function (fn) { effectCleanups.push(fn()) },
    slots: {
      inject: function (name, fn) { fn() },
      register: function (meta, component) {
        registered.push({ meta: meta, component: component })
        return function () {}
      },
    },
  }
  client.apply(ctx)
  return registered[0]
}

function walk(node, visit) {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node !== 'object') return
  // Function components are invoked the way React would invoke them, so the tree
  // this walks is the tree the browser renders. Without this a component that
  // returns real output looks like an empty node and its contents go
  // unverified — which is exactly how the missing tethers hid.
  if (typeof node.type === 'function') {
    walk(node.type(node.props), visit)
    return
  }
  visit(node)
  for (const child of node.children) walk(child, visit)
}

function findByProp(tree, name) {
  let found
  walk(tree, function (node) {
    if (found === undefined && node.props !== undefined && node.props[name] !== undefined) found = node
  })
  return found
}

/** The pet node itself, as opposed to the click-through layer that holds it. */
function findPet(tree) {
  let found
  walk(tree, function (node) {
    if (found === undefined && typeof node.props.className === 'string' && node.props.className.includes('vp-pet')) {
      found = node
    }
  })
  return found
}

/**
 * Render once, let the poll resolve, then render again with data and layout in
 * hand. Hook slots are reset per pass so the second pass sees what the first
 * pass's effects stored.
 */
async function render(snapshot, options) {
  // Release the previous render's poll first: subscribe() installs an interval,
  // and dropping the cleanup list would leave it running and hang the runner.
  cleanup()
  global.__reducedMotion = options !== undefined && options.reducedMotion === true
  fetched = snapshot
  const entry = capture()

  slotIndex = 0
  entry.component()
  await new Promise(function (resolve) { setTimeout(resolve, 0) })
  slotIndex = 0
  const tree = entry.component()
  return { tree: tree, meta: entry.meta }
}

function cleanup() {
  const pending = effectCleanups
  effectCleanups = []
  for (const fn of pending) {
    if (typeof fn === 'function') fn()
  }
}

// Every test, including one that fails and returns early. Without this a failing
// assertion leaves the rendered component's poll interval alive and the test
// runner never exits — a hang that hides the actual failure.
afterEach(cleanup)

test('the overlay registers on shell.overlay with its own id', () => {
  const entry = capture()
  // The descriptor keeps the slot it was registered against, plus our own id.
  assert.equal(entry.meta.name, 'shell.overlay')
  assert.equal(entry.meta.id, 'signal-pet')
  assert.equal(entry.meta.label, '状态宠物')
  assert.equal(entry.meta.order, 60)
  assert.equal(typeof entry.component, 'function')
})

test('the rendered tree carries data-pet-state, which is the acceptance hook', async () => {
  for (const phase of ['idle', 'thinking', 'working', 'error', 'celebrate']) {
    const rendered = await render({ phase: phase, toolsRunning: 2, tethers: 2, busyMs: 1500, toolsTotal: 3 })
    // On the layer and on the pet itself: a screenshot check or an automation
    // should not have to know which of the two it landed on.
    assert.equal(rendered.tree.props['data-pet-state'], phase)
    const pet = findPet(rendered.tree)
    assert.ok(pet !== undefined, 'the pet node carries the state too')
    assert.equal(pet.props['data-pet-state'], phase)
    assert.ok(pet.props.className.includes('vp-anim-' + phase), 'the animation class follows the state')
  }
})

test('an unknown phase from the host renders as idle rather than blank', async () => {
  const rendered = await render({ phase: 'exploded' })
  assert.equal(rendered.tree.props['data-pet-state'], 'idle')
})

test('reduced motion selects the static mode and drops the animated tethers', async () => {
  const rendered = await render(
    { phase: 'working', toolsRunning: 3, tethers: 3, busyMs: 900 },
    { reducedMotion: true },
  )
  assert.equal(rendered.tree.props['data-pet-mode'], 'static')
  const pet = findPet(rendered.tree)
  assert.ok(pet.props.className.includes('vp-static'), 'the static class is what removes the keyframes')
  // Tethers are movement for its own sake; the static form conveys the same
  // information through the ring colour and the label.
  let tethers = 0
  walk(rendered.tree, function (node) { if (node.props.className === 'vp-tethers') tethers += 1 })
  assert.equal(tethers, 0)
})

test('tethers are drawn, one per running tool, when motion is allowed', async () => {
  const rendered = await render({ phase: 'working', toolsRunning: 3, tethers: 3, busyMs: 900 })
  assert.equal(rendered.tree.props['data-pet-mode'], 'animated')
  let tethers = 0
  walk(rendered.tree, function (node) { if (node.props.className === 'vp-tethers') tethers += 1 })
  assert.equal(tethers, 1)
  let paths = 0
  walk(rendered.tree, function (node) { if (node.props.className === 'vp-tether') paths += 1 })
  assert.equal(paths, 3)
})

test('the label always carries the state in words, not only in colour', async () => {
  // Colour alone is not an indicator: it fails for colour-blind users and in a
  // screenshot where someone has to describe what they see.
  const rendered = await render({ phase: 'error', error: { message: 'bash 失败' } })
  let label
  walk(rendered.tree, function (node) {
    if (label === undefined && node.props.className === 'vp-label') label = node
  })
  assert.ok(label !== undefined)
  const text = label.children.join('')
  assert.ok(text.includes('出错了'))
  assert.ok(text.includes('bash 失败'))
})

test('the pet is positioned by the placement maths, not by CSS', async () => {
  const rendered = await render({ phase: 'idle' })
  const pet = findPet(rendered.tree)
  assert.equal(pet.props.style.left, (1200 - 64 - 16) + 'px')
  assert.equal(pet.props.style.top, (800 - 64 - 16) + 'px')
})

test('the pet is clickable so it can be collapsed out of the way', async () => {
  const rendered = await render({ phase: 'idle' })
  const pet = findPet(rendered.tree)
  assert.equal(typeof pet.props.onClick, 'function')
  assert.ok(typeof pet.props.title === 'string' && pet.props.title.length > 0)
})

test('a celebration renders the burst, and only then', async () => {
  const celebrating = await render({ phase: 'celebrate', celebrateMs: 12_000 })
  let sparks = 0
  walk(celebrating.tree, function (node) {
    if (typeof node.props.className === 'string' && node.props.className.includes('vp-spark')) sparks += 1
  })
  assert.equal(sparks, 3)

  const idle = await render({ phase: 'idle' })
  let none = 0
  walk(idle.tree, function (node) {
    if (typeof node.props.className === 'string' && node.props.className.includes('vp-spark')) none += 1
  })
  assert.equal(none, 0)
})

test('a slot registration failure is contained instead of aborting the client boot', () => {
  const warnings = []
  const originalWarn = console.warn
  console.warn = function (message) { warnings.push(String(message)) }
  const ctx = {
    effect: function (fn) { const cleanupFn = fn(); if (typeof cleanupFn === 'function') cleanupFn() },
    slots: {
      inject: function (name, fn) { fn() },
      register: function () { throw new Error('slot contract changed') },
    },
  }
  try {
    client.apply(ctx)
  } finally {
    console.warn = originalWarn
  }
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0].includes('overlay'))
})
