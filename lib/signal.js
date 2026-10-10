// The signal state machine: pure, deterministic, no timers and no I/O.
//
// Everything the pet shows is derived from here, which is what makes the pet
// trustworthy as an indicator rather than just cute. The host half feeds real
// harness events in; this module decides what they mean; the client half only
// renders the answer. Nothing anywhere recomputes state independently, so the
// pet and the JSON endpoint can never disagree.
//
// The phase is DERIVED from the recorded facts on every read rather than stored
// as it changes. Transient states (an error that fades, a celebration window)
// would otherwise need a timer to clear them, and a state machine that depends
// on timers is a state machine that gets stuck the one time a timer does not
// fire.

export const PHASES = ['idle', 'thinking', 'working', 'error', 'celebrate']

export const DEFAULTS = {
  // An error stays visible this long before the pet falls back to what is
  // actually happening now.
  errorTtlMs: 12000,
  // One celebration per completion, not per tool.
  celebrateMs: 2600,
  // A turn has to have run at least this long to be worth celebrating. Below it,
  // finishing is ordinary and a party every time would be noise.
  celebrateAfterMs: 10000,
  // Ties between the two are cut here: an error outranks everything, because the
  // whole point of the pet is being the thing you notice when something is wrong.
  maxTethers: 6,
}

export function createState() {
  return {
    rev: 0,
    // sessionId -> the moment that session's current turn started running.
    running: {},
    toolsRunning: 0,
    toolsTotal: 0,
    toolsFailed: 0,
    lastTool: null,
    error: null,
    celebrate: null,
    currentSession: null,
    // Set on the first tool of a turn so "busy" survives the gaps between them.
    busySince: null,
    // An explicitly requested phase, for verifying the animation and for taking
    // screenshots of states that are otherwise only reachable by waiting.
    forced: null,
  }
}

function sessionOf(event) {
  const agent = event === undefined || event === null ? undefined : event.agent
  if (agent === undefined || agent === null) return null
  const id = agent.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

function bump(state, patch) {
  const next = Object.assign({}, state, patch)
  next.rev = state.rev + 1
  return next
}

function messageOf(error) {
  if (error === undefined || error === null) return '未知错误'
  if (typeof error === 'string') return error
  const text = error.message
  if (typeof text === 'string' && text.length > 0) return text
  try {
    return JSON.stringify(error)
  } catch (inner) {
    return String(error)
  }
}

/** How long the current work has been going, or 0 when nothing is running. */
export function busyMs(state, now) {
  if (state.busySince === null) return 0
  return Math.max(0, now - state.busySince)
}

/**
 * Apply one harness event.
 *
 * Unknown event types are returned unchanged rather than throwing: this runs on
 * the host inside event listeners, and a listener that throws would damage the
 * very turns it is supposed to be reporting on.
 *
 * @param {object} state
 * @param {{type:string, agent?:{id:string}, name?:string, isError?:boolean,
 *          ms?:number, error?:unknown, tool?:string}} event
 * @param {number} now
 * @param {object} [options]
 */
export function reduce(state, event, now, options) {
  const opts = Object.assign({}, DEFAULTS, options || {})
  const type = event === undefined || event === null ? '' : event.type
  const session = sessionOf(event)

  if (type === 'agent-status') {
    const status = event.status
    if (status === 'running') {
      const running = Object.assign({}, state.running)
      running[session === null ? 'unknown' : session] = now
      return bump(state, {
        running: running,
        currentSession: session === null ? state.currentSession : session,
        // A new turn clears the previous verdict: the error belonged to the last
        // turn, and leaving it up would make every later turn look broken.
        error: null,
        busySince: state.busySince === null ? now : state.busySince,
      })
    }
    if (status === 'idle') {
      const running = Object.assign({}, state.running)
      delete running[session === null ? 'unknown' : session]
      const stillRunning = Object.keys(running).length > 0
      return bump(state, {
        running: running,
        busySince: stillRunning ? state.busySince : null,
      })
    }
    return state
  }

  if (type === 'tool-start') {
    return bump(state, {
      toolsRunning: state.toolsRunning + 1,
      toolsTotal: state.toolsTotal + 1,
      lastTool: {
        name: String(event.name === undefined || event.name === null ? '' : event.name),
        at: now,
        isError: false,
        ms: null,
      },
      currentSession: session === null ? state.currentSession : session,
      busySince: state.busySince === null ? now : state.busySince,
    })
  }

  if (type === 'tool-end') {
    const failed = event.isError === true
    return bump(state, {
      toolsRunning: Math.max(0, state.toolsRunning - 1),
      toolsFailed: state.toolsFailed + (failed ? 1 : 0),
      lastTool: {
        name: String(event.name === undefined || event.name === null ? '' : event.name),
        at: now,
        isError: failed,
        ms: Number.isFinite(event.ms) ? event.ms : null,
      },
      error: failed
        ? { message: String(event.tool || event.name || '工具') + ' 失败', tool: String(event.name || ''), at: now }
        : state.error,
    })
  }

  if (type === 'agent-error') {
    return bump(state, {
      error: { message: messageOf(event.error), tool: '', at: now },
    })
  }

  if (type === 'turn-stopping') {
    let key = session === null ? 'unknown' : session
    // If the session cannot be matched — a payload without an agent, or a
    // renamed id — deleting `unknown` would be a silent no-op and the
    // celebration would never fire, which is a feature quietly disappearing
    // rather than failing. With exactly one turn running there is no ambiguity
    // about which turn just closed.
    if (state.running[key] === undefined) {
      const keys = Object.keys(state.running)
      if (keys.length === 1) key = keys[0]
    }
    const since = state.running[key]
    const duration = typeof since === 'number' ? now - since : 0
    const running = Object.assign({}, state.running)
    delete running[key]
    const celebrate = duration >= opts.celebrateAfterMs
    return bump(state, {
      running: running,
      busySince: Object.keys(running).length > 0 ? state.busySince : null,
      // A fresh completion always wins: seeing the celebration for the work you
      // just watched is the point, and a stale error from the previous turn
      // should not mask it.
      error: celebrate ? null : state.error,
      celebrate: celebrate ? { at: now, until: now + opts.celebrateMs, ms: duration } : state.celebrate,
    })
  }

  if (type === 'pulse') {
    const phase = PHASES.indexOf(event.phase) >= 0 ? event.phase : 'celebrate'
    return bump(state, { forced: { phase: phase, until: now + opts.celebrateMs } })
  }

  if (type === 'reset') return createState()

  return state
}

/**
 * What the pet should be showing right now.
 *
 * Order is the product decision, not an accident: error beats everything, then
 * real tool work, then thinking, then a celebration, then rest.
 */
export function derivePhase(state, now, options) {
  const opts = Object.assign({}, DEFAULTS, options || {})
  // A forced phase outranks even an error. It exists only because someone asked
  // for it explicitly — to check the animation, or to screenshot a state that is
  // otherwise only reachable by waiting for it — and a verification hook that
  // the current situation can override verifies nothing.
  if (state.forced !== null && now < state.forced.until) return state.forced.phase
  if (state.error !== null && now - state.error.at < opts.errorTtlMs) return 'error'
  if (state.toolsRunning > 0) return 'working'
  if (Object.keys(state.running).length > 0) return 'thinking'
  if (state.celebrate !== null && now < state.celebrate.until) return 'celebrate'
  return 'idle'
}

/**
 * The wire object the client renders from.
 *
 * Flat and JSON-safe on purpose: it is polled over HTTP and asserted in tests,
 * so nested state would only make both harder.
 */
export function snapshot(state, now, options) {
  const opts = Object.assign({}, DEFAULTS, options || {})
  const phase = derivePhase(state, now, options)
  const errorVisible = state.error !== null && now - state.error.at < opts.errorTtlMs
  return {
    rev: state.rev,
    at: now,
    phase: phase,
    // 0..1, how many tethers the pet should be drawing.
    tethers: Math.min(state.toolsRunning, opts.maxTethers),
    toolsRunning: state.toolsRunning,
    toolsTotal: state.toolsTotal,
    toolsFailed: state.toolsFailed,
    lastTool: state.lastTool,
    lastToolAgeMs: state.lastTool === null ? null : Math.max(0, now - state.lastTool.at),
    busyMs: busyMs(state, now),
    busy: state.busySince !== null || state.toolsRunning > 0,
    error: errorVisible ? { message: state.error.message, tool: state.error.tool } : null,
    errorAgeMs: errorVisible ? now - state.error.at : null,
    celebrating: phase === 'celebrate',
    forced: state.forced !== null && now < state.forced.until,
    celebrateMs: state.celebrate === null ? null : state.celebrate.ms,
    session: state.currentSession,
  }
}
