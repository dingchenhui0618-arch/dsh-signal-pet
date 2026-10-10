// The host half is driven through a stub cordis Context: real listeners, real
// HTTP handler. The point of these tests is the wiring — that the events the
// harness actually emits reach the state machine, and that the waterfall
// listener can never block a tool call.
import test from 'node:test'
import { strict as assert } from 'node:assert'
import { apply, name, inject, internals } from '../src/host.js'

function fakeReq(method, url, body) {
  const handlers = {}
  const req = { method: method, url: url }
  req.on = function (event, cb) {
    handlers[event] = cb
    return req
  }
  req.destroy = function () {}
  setImmediate(function () {
    if (body !== undefined && handlers.data) handlers.data(JSON.stringify(body))
    if (handlers.end) handlers.end()
  })
  return req
}

function fakeRes() {
  let resolve
  const done = new Promise(function (r) { resolve = r })
  const res = {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader: function (key, value) { res.headers[key] = value },
    end: function (chunk) {
      res.body = chunk
      resolve()
    },
  }
  return { res: res, done: done }
}

function setup(options) {
  const handlers = new Map()
  const routes = []
  const effects = []
  const ctx = {
    effect: function (fn) { effects.push(fn()) },
    get: function () { return undefined },
    on: function (event, fn) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(fn)
      return function () {}
    },
    webServer: {
      register: function (route) {
        routes.push(route)
        return function () {}
      },
    },
  }
  apply(ctx, options || {})
  return {
    handlers: handlers,
    routes: routes,
    effects: effects,
    emit: function (event, ...args) {
      const list = handlers.get(event) || []
      return Promise.all(list.map(function (fn) { return fn.apply(null, args) }))
    },
  }
}

async function get(built, url) {
  assert.equal(built.routes.length, 1, 'exactly one route should be registered')
  const { res, done } = fakeRes()
  await built.routes[0].handler(fakeReq('GET', url || '/dsh-signal-pet'), res)
  await done
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

async function post(built, url, body) {
  const { res, done } = fakeRes()
  await built.routes[0].handler(fakeReq('POST', url, body === undefined ? {} : body), res)
  await done
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

test('the plugin declares the name and the service it needs', () => {
  assert.equal(name, 'dsh-signal-pet')
  assert.deepEqual(inject, ['webServer'])
})

test('it listens to the five events the pet is built from', () => {
  const built = setup()
  assert.deepEqual(Array.from(built.handlers.keys()).sort(), [
    'agent/error',
    'agent/status',
    'agent/turn-stopping',
    'tools/pre-execute',
    'tools/result',
  ])
  assert.equal(built.effects.length, 1, 'one effect owns the route')
  assert.equal(typeof built.effects[0], 'function')
})

test('state starts idle and empty over HTTP', async () => {
  const built = setup()
  const res = await get(built)
  assert.equal(res.status, 200)
  assert.equal(res.body.phase, 'idle')
  assert.equal(res.body.busy, false)
  assert.equal(res.body.enabled, true)
  assert.equal(res.body.stats.events, 0)
  assert.equal(res.body.lastTool, null)
  assert.equal(res.body.error, null)
})

test('a running agent turns the pet to thinking', async () => {
  const built = setup()
  await built.emit('agent/status', { agent: { id: 's1' }, status: 'running' })
  const res = await get(built)
  assert.equal(res.body.phase, 'thinking')
  assert.equal(res.body.busy, true)
  assert.equal(res.body.session, 's1')
  assert.equal(res.body.stats.events, 1)
})

test('the waterfall listener allows the tool call and returns the decision', async () => {
  const built = setup()
  const decision = { kind: 'allow' }
  const next = async function () { return decision }
  const returned = await built.emit('tools/pre-execute', { callId: 'c1', name: 'bash' }, next)
  assert.deepEqual(returned, [decision])
  const res = await get(built)
  assert.equal(res.body.phase, 'working')
  assert.equal(res.body.toolsRunning, 1)
  assert.equal(res.body.tethers, 1)
})

test('a malformed execution still reaches next, so a tool is never blocked', async () => {
  // This listener sits in the waterfall that decides whether a tool runs at all.
  // If it could throw before next(), the pet would be able to break the very
  // work it reports on.
  const built = setup()
  let called = 0
  const next = async function () { called += 1; return { kind: 'allow' } }
  for (const exec of [undefined, null, {}, { callId: undefined, name: undefined }, { agent: null }]) {
    await built.emit('tools/pre-execute', exec, next)
  }
  assert.equal(called, 5, 'every input reached next()')
  const res = await get(built)
  assert.equal(res.status, 200)
})

test('a tool result closes the tether and records its duration and failure', async () => {
  const built = setup()
  await built.emit('agent/status', { agent: { id: 's1' }, status: 'running' })
  await built.emit('tools/pre-execute', { callId: 'c9', name: 'write' }, async function () { return { kind: 'allow' } })
  await built.emit('tools/result', { callId: 'c9', name: 'write' }, { isError: true })

  const res = await get(built)
  assert.equal(res.body.phase, 'error')
  assert.equal(res.body.toolsRunning, 0)
  assert.equal(res.body.toolsFailed, 1)
  assert.equal(res.body.lastTool.name, 'write')
  assert.equal(res.body.lastTool.isError, true)
  assert.ok(typeof res.body.lastTool.ms === 'number' && res.body.lastTool.ms >= 0)
  assert.ok(res.body.error.message.includes('write'))
})

test('a result with no matching start still records rather than throwing', async () => {
  const built = setup()
  await built.emit('tools/result', { callId: 'never-seen', name: 'x' }, { isError: false })
  const res = await get(built)
  assert.equal(res.status, 200)
  assert.equal(res.body.toolsTotal, 0, 'total counts starts, not results')
  assert.equal(res.body.lastTool.name, 'x')
  assert.equal(res.body.lastTool.ms, null)
})

test('an agent error carries its message to the client', async () => {
  const built = setup()
  await built.emit('agent/error', { agent: { id: 's1' }, turn: 1, step: 2, error: new Error('upstream 502') })
  const res = await get(built)
  assert.equal(res.body.phase, 'error')
  assert.equal(res.body.error.message, 'upstream 502')
  assert.equal(res.body.stats.errors, 1)
})

test('a long turn celebrates, and the stats count it', async () => {
  const built = setup({ celebrateAfterMs: 0 })
  await built.emit('agent/status', { agent: { id: 's1' }, status: 'running' })
  await built.emit('agent/turn-stopping', { agent: { id: 's1' }, turn: 1 })
  const res = await get(built)
  assert.equal(res.body.phase, 'celebrate')
  assert.equal(res.body.celebrating, true)
  assert.equal(res.body.stats.turns, 1)
  assert.equal(res.body.stats.celebrations, 1)
})

test('turning the feature off leaves the endpoint answering but quiet', async () => {
  const built = setup({ enabled: false })
  await built.emit('agent/status', { agent: { id: 's1' }, status: 'running' })
  const res = await get(built)
  assert.equal(res.status, 200)
  assert.equal(res.body.enabled, false)
  assert.equal(res.body.phase, 'idle')
  assert.equal(res.body.stats.events, 0)
})

test('reset clears the state', async () => {
  const built = setup()
  await built.emit('agent/status', { agent: { id: 's1' }, status: 'running' })
  assert.equal((await get(built)).body.phase, 'thinking')
  const cleared = await post(built, '/dsh-signal-pet/reset')
  assert.equal(cleared.status, 200)
  assert.equal((await get(built)).body.phase, 'idle')
})

test('pulse forces a phase so every state can be verified or screenshotted', async () => {
  const built = setup()
  // A tool is running, which is exactly the situation the endpoint is called
  // from — and exactly the situation a celebration would otherwise be hidden by.
  await built.emit('agent/status', { agent: { id: 's1' }, status: 'running' })
  await built.emit('tools/pre-execute', { callId: 'c1', name: 'bash' }, async function () { return { kind: 'allow' } })
  assert.equal((await get(built)).body.phase, 'working')

  const pulsed = await post(built, '/dsh-signal-pet/pulse')
  assert.equal(pulsed.status, 200)
  assert.equal(pulsed.body.snapshot.phase, 'celebrate')
  assert.equal((await get(built)).body.phase, 'celebrate')
})

test('pulse can preview every phase, which is what makes screenshot checks possible', async () => {
  const built = setup()
  // A tool is running throughout, so each preview has to outrank a live
  // situation rather than merely coincide with an idle one.
  await built.emit('agent/status', { agent: { id: 's1' }, status: 'running' })
  await built.emit('tools/pre-execute', { callId: 'c1', name: 'bash' }, async function () { return { kind: 'allow' } })
  for (const phase of ['idle', 'thinking', 'working', 'error', 'celebrate']) {
    const pulsed = await post(built, '/dsh-signal-pet/pulse', { phase: phase })
    assert.equal(pulsed.body.phase, phase)
    assert.equal(pulsed.body.snapshot.phase, phase)
    assert.equal((await get(built)).body.phase, phase)
  }
  // An unknown phase falls back rather than rendering `undefined` on screen.
  const bogus = await post(built, '/dsh-signal-pet/pulse', { phase: 'explode' })
  assert.equal(bogus.body.snapshot.phase, 'celebrate')
})

test('the route refuses unknown methods and unknown paths', async () => {
  const built = setup()
  assert.equal((await get(built, '/dsh-signal-pet/nope')).status, 404)
  assert.equal((await get(built, '/dsh-signal-pet/state')).status, 200)
  assert.equal((await post(built, '/dsh-signal-pet/nope')).status, 404)
  const { res, done } = fakeRes()
  await built.routes[0].handler(fakeReq('DELETE', '/dsh-signal-pet'), res)
  await done
  assert.equal(res.statusCode, 405)
})

test('the path helper accepts the prefix and only the prefix', () => {
  assert.equal(internals.pathOf('/dsh-signal-pet'), '')
  assert.equal(internals.pathOf('/dsh-signal-pet/'), '')
  assert.equal(internals.pathOf('/dsh-signal-pet?x=1'), '')
  assert.equal(internals.pathOf('/dsh-signal-pet/reset'), 'reset')
  assert.equal(internals.pathOf('/other'), null)
  assert.equal(internals.pathOf(undefined), null)
})

test('every registration is reversible', () => {
  const built = setup()
  assert.equal(typeof built.effects[0], 'function')
  built.effects[0]()
})
