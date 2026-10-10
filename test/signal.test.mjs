// The state machine decides what the pet means, so the transitions are pinned
// exactly. Every case feeds synthetic harness events and asserts the phase, the
// counts and — for the purity claim — that the input object was not touched.
import test from 'node:test'
import { strict as assert } from 'node:assert'
import { DEFAULTS, PHASES, busyMs, createState, derivePhase, reduce, snapshot } from '../src/signal.js'

const T0 = 1_000_000

function run(events, options) {
  let state = createState()
  let now = T0
  const phases = []
  for (const event of events) {
    if (typeof event === 'number') {
      now = event
      phases.push(derivePhase(state, now, options))
      continue
    }
    state = reduce(state, event, now, options)
    phases.push(derivePhase(state, now, options))
  }
  return { state: state, now: now, phases: phases }
}

function running(id) {
  return { type: 'agent-status', status: 'running', agent: { id: id || 's1' } }
}

function idle(id) {
  return { type: 'agent-status', status: 'idle', agent: { id: id || 's1' } }
}

function stopping(id) {
  return id === undefined ? { type: 'turn-stopping' } : { type: 'turn-stopping', agent: { id: id } }
}

test('a fresh state is idle and empty', () => {
  const state = createState()
  assert.equal(derivePhase(state, T0), 'idle')
  const wire = snapshot(state, T0)
  assert.equal(wire.phase, 'idle')
  assert.equal(wire.busy, false)
  assert.equal(wire.toolsRunning, 0)
  assert.equal(wire.error, null)
  assert.deepEqual(PHASES, ['idle', 'thinking', 'working', 'error', 'celebrate'])
})

test('a running agent reads as thinking', () => {
  const out = run([running()])
  assert.equal(out.phases[out.phases.length - 1], 'thinking')
  assert.equal(snapshot(out.state, out.now).busy, true)
})

test('a tool call outranks thinking and returns to it when done', () => {
  const out = run([
    running(),
    { type: 'tool-start', name: 'bash' },
    'phase-now',
    { type: 'tool-end', name: 'bash', isError: false, ms: 120 },
  ])
  assert.equal(out.phases[1], 'working')
  assert.equal(out.phases[3], 'thinking')
  const wire = snapshot(out.state, out.now)
  assert.equal(wire.toolsRunning, 0)
  assert.equal(wire.toolsTotal, 1)
  assert.equal(wire.toolsFailed, 0)
  assert.equal(wire.lastTool.name, 'bash')
  assert.equal(wire.lastTool.ms, 120)
})

test('a failed tool shows the error phase and counts once', () => {
  const out = run([
    running(),
    { type: 'tool-start', name: 'bash' },
    { type: 'tool-end', name: 'bash', isError: true, ms: 30 },
  ])
  assert.equal(out.phases[2], 'error')
  const wire = snapshot(out.state, out.now)
  assert.equal(wire.toolsFailed, 1)
  assert.equal(wire.toolsRunning, 0)
  assert.ok(wire.error.message.includes('bash'))
  assert.equal(wire.lastTool.isError, true)
})

test('an agent error surfaces its message', () => {
  const out = run([running(), { type: 'agent-error', error: new Error('模型返回 500') }])
  assert.equal(out.phases[1], 'error')
  assert.equal(snapshot(out.state, out.now).error.message, '模型返回 500')
})

test('an error with no message still produces one', () => {
  const out = run([running(), { type: 'agent-error', error: undefined }])
  assert.equal(snapshot(out.state, out.now).error.message, '未知错误')
})

test('an error outranks everything while it is fresh', () => {
  const out = run([
    running(),
    { type: 'agent-error', error: 'boom' },
    { type: 'tool-start', name: 'read' },
  ])
  // A tool is running, yet the pet still shows the error: being noticed when
  // something broke is the pet's whole job.
  assert.equal(out.phases[2], 'error')
  assert.equal(snapshot(out.state, out.now).toolsRunning, 1)
})

test('an error fades back to what is happening now', () => {
  const out = run([
    running(),
    { type: 'tool-start', name: 'read' },
    { type: 'tool-end', name: 'read', isError: true },
  ])
  assert.equal(out.phases[2], 'error')
  const later = T0 + DEFAULTS.errorTtlMs + 1
  // The tool is done and the agent is still running, so thinking is the truth.
  assert.equal(derivePhase(out.state, later), 'thinking')
  assert.equal(snapshot(out.state, later).error, null)
  assert.equal(snapshot(out.state, later).phase, 'thinking')
})

test('a long turn celebrates when it closes', () => {
  const out = run([
    running(),
    T0 + DEFAULTS.celebrateAfterMs + 5,
    stopping('s1'),
  ])
  assert.equal(out.phases[2], 'celebrate')
  const wire = snapshot(out.state, out.now)
  assert.equal(wire.celebrating, true)
  assert.equal(wire.celebrateMs, DEFAULTS.celebrateAfterMs + 5)
})

test('a turn-stopping without a usable session still celebrates', () => {
  // Regression: keyed on `unknown`, the delete was a no-op and the celebration
  // silently never fired. A lone running turn has only one possible owner.
  const out = run([
    running(),
    T0 + DEFAULTS.celebrateAfterMs + 5,
    stopping(),
  ])
  assert.equal(out.phases[2], 'celebrate')
})

test('a short turn does not celebrate', () => {
  const out = run([
    running(),
    T0 + 500,
    stopping('s1'),
  ])
  assert.equal(out.phases[2], 'idle')
  assert.equal(snapshot(out.state, out.now).celebrating, false)
})

test('a celebration ends on its own', () => {
  const out = run([running(), T0 + DEFAULTS.celebrateAfterMs + 5, stopping('s1')])
  assert.equal(derivePhase(out.state, out.now), 'celebrate')
  assert.equal(derivePhase(out.state, out.now + DEFAULTS.celebrateMs + 1), 'idle')
})

test('a new turn clears the previous turn s error', () => {
  const out = run([
    running(),
    { type: 'agent-error', error: '上一轮的错' },
    idle(),
    running(),
  ])
  assert.equal(out.phases[1], 'error')
  assert.equal(out.phases[3], 'thinking')
  assert.equal(snapshot(out.state, out.now).error, null)
})

test('a celebration clears the stale error it would otherwise hide behind', () => {
  let state = createState()
  state = reduce(state, running(), T0)
  state = reduce(state, { type: 'agent-error', error: '旧的错' }, T0 + 100)
  state = reduce(state, stopping('s1'), T0 + DEFAULTS.celebrateAfterMs + 200)
  // Seeing the finish of the long job you just waited for beats re-reading an
  // error that the same turn already resolved.
  assert.equal(derivePhase(state, T0 + DEFAULTS.celebrateAfterMs + 201), 'celebrate')
})

test('one idle session does not clear another session s work', () => {
  let state = createState()
  state = reduce(state, running('a'), T0)
  state = reduce(state, running('b'), T0)
  state = reduce(state, idle('a'), T0)
  assert.equal(derivePhase(state, T0), 'thinking')
  state = reduce(state, idle('b'), T0)
  assert.equal(derivePhase(state, T0), 'idle')
})

test('concurrent tools count up and down independently', () => {
  const out = run([
    running(),
    { type: 'tool-start', name: 'a' },
    { type: 'tool-start', name: 'b' },
    { type: 'tool-start', name: 'c' },
    { type: 'tool-end', name: 'a', isError: false },
  ])
  const wire = snapshot(out.state, out.now)
  assert.equal(wire.toolsRunning, 2)
  assert.equal(wire.toolsTotal, 3)
  assert.equal(wire.tethers, 2)
})

test('the tether count is capped so a burst cannot paper over the screen', () => {
  let state = createState()
  const started = T0
  state = reduce(state, running(), started)
  for (let i = 0; i < DEFAULTS.maxTethers + 5; i += 1) {
    state = reduce(state, { type: 'tool-start', name: 't' + i }, started)
  }
  const wire = snapshot(state, started)
  assert.equal(wire.toolsRunning, DEFAULTS.maxTethers + 5)
  assert.equal(wire.tethers, DEFAULTS.maxTethers)
})

test('busy time is measured from the first activity, not from the last event', () => {
  let state = createState()
  state = reduce(state, running(), T0)
  state = reduce(state, { type: 'tool-start', name: 'x' }, T0 + 3000)
  state = reduce(state, { type: 'tool-end', name: 'x', isError: false }, T0 + 4000)
  assert.equal(busyMs(state, T0 + 10_000), 10_000)
  // Idle means no busy time to report.
  const after = reduce(state, idle(), T0 + 11_000)
  assert.equal(busyMs(after, T0 + 12_000), 0)
})

test('reduce never mutates the state it was given', () => {
  const before = createState()
  const copy = JSON.parse(JSON.stringify(before))
  const after = reduce(before, running(), T0)
  assert.notEqual(after, before, 'a new object is returned')
  assert.deepEqual(before, copy, 'the input is untouched')
  assert.equal(before.rev, 0)
  assert.equal(after.rev, 1)
})

test('rev increments on every accepted event, so a client can poll cheaply', () => {
  let state = createState()
  const seen = []
  for (const event of [running(), { type: 'tool-start', name: 'a' }, { type: 'tool-end', name: 'a' }]) {
    state = reduce(state, event, T0)
    seen.push(state.rev)
  }
  assert.deepEqual(seen, [1, 2, 3])
})

test('an unknown or malformed event is ignored rather than thrown', () => {
  const state = reduce(createState(), running(), T0)
  assert.equal(reduce(state, { type: 'nonsense' }, T0), state)
  assert.equal(reduce(state, undefined, T0), state)
  assert.equal(reduce(state, null, T0), state)
  assert.equal(reduce(state, { type: 'agent-status', status: 'weird' }, T0), state)
  // An event with no agent is tolerated: the pet must never break a turn.
  const anonymous = reduce(state, { type: 'tool-start' }, T0)
  assert.equal(snapshot(anonymous, T0).toolsRunning, 1)
})

test('a forced phase outranks the live situation', () => {
  // The verification hook has to win: it is called from inside a tool call, so a
  // tool is always running, and a celebration the running tool hides would
  // verify nothing.
  let state = createState()
  state = reduce(state, running(), T0)
  state = reduce(state, { type: 'tool-start', name: 'bash' }, T0)
  state = reduce(state, { type: 'agent-error', error: 'boom' }, T0)
  assert.equal(derivePhase(state, T0), 'error')
  state = reduce(state, { type: 'pulse', phase: 'celebrate' }, T0)
  assert.equal(derivePhase(state, T0), 'celebrate')
  assert.equal(snapshot(state, T0).forced, true)
  // And it expires, so a stuck pulse cannot hide a real error forever.
  assert.equal(derivePhase(state, T0 + DEFAULTS.celebrateMs + 1), 'error')
  assert.equal(snapshot(state, T0 + DEFAULTS.celebrateMs + 1).forced, false)
})

test('a pulse can preview any real phase and ignores nonsense', () => {
  for (const phase of PHASES) {
    const state = reduce(createState(), { type: 'pulse', phase: phase }, T0)
    assert.equal(derivePhase(state, T0), phase)
  }
  const bogus = reduce(createState(), { type: 'pulse', phase: 'explode' }, T0)
  assert.equal(derivePhase(bogus, T0), 'celebrate', 'an unknown phase falls back to the celebration')
})

test('reset returns a fresh state', () => {
  const state = reduce(createState(), running(), T0)
  assert.equal(snapshot(reduce(state, { type: 'reset' }, T0), T0).phase, 'idle')
})

test('the snapshot is flat and JSON-safe', () => {
  const out = run([
    running(),
    { type: 'tool-start', name: 'bash' },
    { type: 'tool-end', name: 'bash', isError: true, ms: 42 },
  ])
  const wire = snapshot(out.state, out.now)
  assert.deepEqual(JSON.parse(JSON.stringify(wire)), wire)
  for (const key of Object.keys(wire)) {
    const value = wire[key]
    assert.ok(value === null || ['string', 'number', 'boolean', 'object'].indexOf(typeof value) >= 0, key)
  }
  assert.equal(typeof wire.rev, 'number')
  assert.equal(typeof wire.tethers, 'number')
  assert.equal(wire.errorAgeMs, 0)
})

test('every phase is reachable from real event sequences', () => {
  const reached = new Set()
  reached.add(derivePhase(createState(), T0))
  reached.add(derivePhase(reduce(createState(), running(), T0), T0))
  reached.add('working')
  reached.add('error')
  reached.add('celebrate')
  assert.deepEqual(Array.from(reached).sort(), PHASES.slice().sort())
})
