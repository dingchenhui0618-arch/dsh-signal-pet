// Host half of dsh-signal-pet.
//
// This half exists because the client cannot see what it needs to see. The pet
// has to know that a turn is running, that a tool just fired, that something
// failed, and that a long job finished — and the reliable source for all four is
// the host's own event bus, not a client-side guess. So the host folds real
// events into one small snapshot and serves it; the client only draws it.
//
// The one thing this file must never do is interfere. `tools/pre-execute` is a
// waterfall that decides whether a tool runs at all, so the listener here always
// reaches `next()` — including on its own internal failure. A status indicator
// that can block the work it is reporting on is worse than no indicator.

import { join } from 'node:path'
import { homedir } from 'node:os'
import { createState, derivePhase, reduce, snapshot, DEFAULTS } from './signal.js'

export const name = 'dsh-signal-pet'
export const inject = ['webServer']

const ROUTE = '/dsh-signal-pet'

function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  return join(homedir(), '.dsh')
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise(function (resolve) {
    let raw = ''
    req.on('data', function (chunk) {
      raw += chunk
      if (raw.length > 262144) req.destroy()
    })
    req.on('end', function () {
      try {
        resolve(raw.length > 0 ? JSON.parse(raw) : {})
      } catch (error) {
        resolve({})
      }
    })
    req.on('error', function () {
      resolve({})
    })
  })
}

function pathOf(url) {
  const path = String(url || '').split('?')[0]
  if (path === ROUTE || path === ROUTE + '/') return ''
  if (path.indexOf(ROUTE + '/') !== 0) return null
  return path.slice(ROUTE.length + 1)
}

/**
 * @param {object} ctx cordis context
 * @param {{errorTtlMs?:number, celebrateMs?:number, celebrateAfterMs?:number,
 *          maxTethers?:number, enabled?:boolean, dataDir?:string}} [config]
 */
export function apply(ctx, config) {
  const settings = config && typeof config === 'object' ? config : {}
  const options = {
    errorTtlMs: Number.isInteger(settings.errorTtlMs) && settings.errorTtlMs >= 0 ? settings.errorTtlMs : DEFAULTS.errorTtlMs,
    celebrateMs: Number.isInteger(settings.celebrateMs) && settings.celebrateMs >= 0 ? settings.celebrateMs : DEFAULTS.celebrateMs,
    celebrateAfterMs: Number.isInteger(settings.celebrateAfterMs) && settings.celebrateAfterMs >= 0
      ? settings.celebrateAfterMs
      : DEFAULTS.celebrateAfterMs,
    maxTethers: Number.isInteger(settings.maxTethers) && settings.maxTethers > 0 ? settings.maxTethers : DEFAULTS.maxTethers,
  }
  const enabled = settings.enabled !== false

  let state = createState()
  // callId -> start time, so a tool's duration is measured rather than guessed.
  const startedAt = new Map()
  const stats = { events: 0, toolStarts: 0, toolEnds: 0, errors: 0, turns: 0, celebrations: 0 }

  function record(event) {
    if (!enabled) return
    try {
      const before = state
      state = reduce(state, event, Date.now(), options)
      stats.events += 1
      if (event.type === 'tool-start') stats.toolStarts += 1
      if (event.type === 'tool-end') stats.toolEnds += 1
      if (event.type === 'agent-error') stats.errors += 1
      if (event.type === 'turn-stopping') stats.turns += 1
      if (state.celebrate !== null && before.celebrate !== state.celebrate) stats.celebrations += 1
    } catch (error) {
      // Reporting must never damage the turn it is reporting on.
    }
  }

  function agentOf(payload) {
    const agent = payload === undefined || payload === null ? undefined : payload.agent
    return agent === undefined || agent === null ? undefined : { id: String(agent.id) }
  }

  ctx.on('agent/status', function (payload) {
    const status = payload === undefined || payload === null ? undefined : payload.status
    if (status !== 'running' && status !== 'idle') return
    record({ type: 'agent-status', status: status, agent: agentOf(payload) })
  })

  // A waterfall, so it must reach next() on every path including its own errors.
  ctx.on('tools/pre-execute', async function (exec, next) {
    try {
      const callId = exec === undefined || exec === null ? undefined : exec.callId
      if (callId !== undefined) startedAt.set(String(callId), Date.now())
      record({
        type: 'tool-start',
        name: exec === undefined || exec === null ? '' : String(exec.name),
        agent: exec === undefined || exec === null ? undefined : exec.agent,
      })
    } catch (error) {
      // fall through to next()
    }
    return next()
  })

  ctx.on('tools/result', function (exec, result) {
    try {
      const callId = exec === undefined || exec === null ? undefined : exec.callId
      const started = callId === undefined ? undefined : startedAt.get(String(callId))
      if (callId !== undefined) startedAt.delete(String(callId))
      record({
        type: 'tool-end',
        name: exec === undefined || exec === null ? '' : String(exec.name),
        isError: result !== undefined && result !== null && result.isError === true,
        ms: typeof started === 'number' ? Date.now() - started : undefined,
        agent: exec === undefined || exec === null ? undefined : exec.agent,
      })
    } catch (error) {
      // An observation must not throw into the result pipeline.
    }
  })

  ctx.on('agent/error', function (payload) {
    record({
      type: 'agent-error',
      error: payload === undefined || payload === null ? undefined : payload.error,
      agent: agentOf(payload),
    })
  })

  ctx.on('agent/turn-stopping', function (payload) {
    record({ type: 'turn-stopping', agent: agentOf(payload) })
  })

  // The panel is disposable; a changed webServer contract must not stop the pet
  // from tracking state (and the state is what a later fix would render from).
  ctx.effect(function () {
    let disposeRoute
    try {
      disposeRoute = ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE,
        handler: async function (req, res) {
          try {
            const method = pathOf(req.url)
            if (method === null) {
              sendJson(res, 404, { error: 'not found' })
              return
            }

            if (req.method === 'GET') {
              // Only the bare prefix (and an explicit /state alias) answers; a
              // GET to an unknown subpath returning the snapshot anyway would
              // make every typo look like it worked.
              if (method !== '' && method !== 'state') {
                sendJson(res, 404, { error: 'not found' })
                return
              }
              const now = Date.now()
              const data = snapshot(state, now, options)
              data.enabled = enabled
              data.stats = stats
              data.config = options
              data.phase = derivePhase(state, now, options)
              sendJson(res, 200, data)
              return
            }

            if (req.method === 'POST') {
              const body = await readBody(req)
              if (method === 'reset') {
                state = createState()
                startedAt.clear()
                sendJson(res, 200, { ok: true })
                return
              }
              if (method === 'pulse') {
                // A forced phase, so the animation can be verified on demand
                // instead of only when a long job happens to finish. This is why
                // it outranks the live state: calling it from inside a tool call
                // means a tool is always running, and a celebration that the
                // running tool hides would verify nothing.
                const phase = typeof body.phase === 'string' ? body.phase : 'celebrate'
                record({ type: 'pulse', phase: phase })
                sendJson(res, 200, {
                  ok: true,
                  phase: typeof body.phase === 'string' ? body.phase : 'celebrate',
                  snapshot: snapshot(state, Date.now(), options),
                })
                return
              }
              sendJson(res, 404, { error: 'unknown method' })
              return
            }

            sendJson(res, 405, { error: 'method not allowed' })
          } catch (error) {
            sendJson(res, 500, { error: String((error && error.message) || error) })
          }
        },
      })
    } catch (error) {
      disposeRoute = undefined
    }
    return function () {
      if (typeof disposeRoute === 'function') disposeRoute()
    }
  })
}

/** Exposed for the test suite: the route shape is part of the contract. */
export const internals = {
  ROUTE: ROUTE,
  pathOf: pathOf,
  dshHome: dshHome,
}
