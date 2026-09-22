'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

function makeApp (paths) {
  const store = Object.assign({}, paths)
  const puts = []
  const emitted = []
  const putHandlers = []
  const subscriptions = []
  return {
    debug: () => {},
    error: () => {},
    setPluginStatus: () => {},
    getSelfPath: (p) => store[p],
    handleMessage: (_id, delta) => {
      emitted.push(delta)
      const v = delta && delta.updates && delta.updates[0] && delta.updates[0].values && delta.updates[0].values[0]
      if (v) store[v.path] = v.value
    },
    putSelfPath: (p, v, cb) => {
      puts.push({ path: p, value: v })
      store[p] = v
      if (cb) cb(null)
    },
    registerPutHandler: (ctx, p, fn) => {
      putHandlers.push({ ctx, path: p, fn })
    },
    puts,
    emitted,
    putHandlers,
    subscriptions,
    subscriptionmanager: {
      subscribe: (sub, unsubscribes) => {
        subscriptions.push(sub)
        unsubscribes.push(() => {})
      }
    }
  }
}

function freshPlugin (app) {
  const resolved = require.resolve('../plugin/index.js')
  delete require.cache[resolved]
  return require('../plugin/index.js')(app)
}

function mockRes () {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader (k, v) { this.headers[k] = v },
    end (s) { this.body = s ? JSON.parse(s) : null }
  }
}

describe('plugin lifecycle', () => {
  let app, plugin

  beforeEach(() => {
    app = makeApp({
      'electrical.switches.starlink.state': 0,
      'network.providers.starlink.status': 'online'
    })
    plugin = freshPlugin(app)
  })

  afterEach(() => {
    try { plugin.stop() } catch (_) {}
  })

  it('has id and schema', () => {
    assert.equal(plugin.id, 'signalk-control-panel-plugin')
    assert.equal(plugin.schema.type, 'object')
    assert.equal(plugin.schema.properties.buttons.items.properties.mode.enum[0], 'switch')
  })

  it('registerWithRouter works before start', () => {
    const routes = []
    const router = {
      get: (p) => routes.push('GET ' + p),
      put: (p) => routes.push('PUT ' + p)
    }
    plugin.registerWithRouter(router)
    assert.ok(routes.includes('GET /status'))
    assert.ok(routes.includes('PUT /buttons/:id'))
  })

  it('marks write routes readwrite when router.access exists', () => {
    const perms = []
    const writeRouter = {
      put (p) { perms.push('PUT ' + p) }
    }
    const router = {
      get () {},
      put () {},
      access (level) {
        perms.push(level)
        return writeRouter
      }
    }
    plugin.registerWithRouter(router)
    assert.ok(perms.includes('readwrite'))
    assert.ok(perms.includes('PUT /buttons/:id'))
  })

  it('subscribes with instant policy and minPeriod, not period', () => {
    plugin.start({
      buttons: [
        { mode: 'switch', label: 'Starlink', path: 'electrical.switches.starlink.state' },
        { mode: 'monitor', label: 'Internet', path: 'network.providers.starlink.status' }
      ]
    })
    assert.equal(app.subscriptions.length, 1)
    const rows = app.subscriptions[0].subscribe
    assert.equal(rows.length, 2)
    rows.forEach((row) => {
      assert.equal(row.policy, 'instant')
      assert.equal(row.minPeriod, 200)
      assert.equal(row.period, undefined)
    })
  })

  it('status snapshot uses live path values', () => {
    plugin.start({
      buttons: [
        { mode: 'switch', label: 'Starlink', path: 'electrical.switches.starlink.state' },
        { mode: 'monitor', label: 'Internet', path: 'network.providers.starlink.status' }
      ]
    })
    const routes = {}
    const router = {
      get (p, fn) { routes['GET ' + p] = fn },
      put () {}
    }
    plugin.registerWithRouter(router)
    const res = mockRes()
    routes['GET /status']({}, res)
    assert.equal(res.body.started, true)
    assert.equal(res.body.buttons.length, 2)
    assert.equal(res.body.buttons[0].on, false)
    assert.equal(res.body.buttons[0].mode, 'switch')
    assert.equal(res.body.buttons[0].slider, false)
    assert.equal(res.body.buttons[1].on, true)
    assert.equal(res.body.buttons[1].mode, 'monitor')
    assert.equal(res.body.buttons[1].slider, false)
  })

  it('PUT toggles a switch and refuses a monitor', async () => {
    plugin.start({
      buttons: [
        { mode: 'switch', label: 'Starlink', path: 'electrical.switches.starlink.state' },
        { mode: 'monitor', label: 'Internet', path: 'network.providers.starlink.status' }
      ]
    })
    const routes = {}
    const router = {
      get () {},
      put (p, fn) { routes['PUT ' + p] = fn }
    }
    plugin.registerWithRouter(router)

    const ok = mockRes()
    await new Promise((resolve) => {
      const end = ok.end.bind(ok)
      ok.end = (s) => { end(s); resolve() }
      routes['PUT /buttons/:id'](
        { params: { id: '0' }, body: { value: 'toggle' }, readableEnded: true },
        ok
      )
    })
    assert.equal(ok.body.buttons[0].on, true)
    assert.equal(app.puts[0].path, 'electrical.switches.starlink.state')
    assert.equal(app.puts[0].value, 1)

    const bad = mockRes()
    await new Promise((resolve) => {
      const end = bad.end.bind(bad)
      bad.end = (s) => { end(s); resolve() }
      routes['PUT /buttons/:id'](
        { params: { id: '1' }, body: {}, readableEnded: true },
        bad
      )
    })
    assert.equal(bad.statusCode, 400)
    assert.match(bad.body.error, /monitor/i)
  })

  it('creates a missing live path on toggle and does not restore it after restart', async () => {
    plugin.start({
      buttons: [
        { mode: 'switch', label: 'Vertrek mode', path: 'automations.helpers.depart_prep' }
      ]
    })
    const routes = {}
    const router = {
      get () {},
      put (p, fn) { routes['PUT ' + p] = fn }
    }
    plugin.registerWithRouter(router)

    const ok = mockRes()
    await new Promise((resolve) => {
      const end = ok.end.bind(ok)
      ok.end = (s) => { end(s); resolve() }
      routes['PUT /buttons/:id'](
        { params: { id: '0' }, body: { value: 'toggle' }, readableEnded: true },
        ok
      )
    })
    assert.equal(ok.body.buttons[0].on, true)
    assert.equal(ok.body.buttons[0].persist, undefined)
    assert.ok(app.emitted.length > 0)

    plugin.stop()
    app = makeApp({})
    plugin = freshPlugin(app)
    plugin.start({
      buttons: [
        { mode: 'switch', label: 'Vertrek mode', path: 'automations.helpers.depart_prep' }
      ]
    })
    const status = mockRes()
    const getRoutes = {}
    plugin.registerWithRouter({
      get (p, fn) { getRoutes['GET ' + p] = fn },
      put () {}
    })
    getRoutes['GET /status']({}, status)
    assert.equal(status.body.buttons[0].on, false)
    assert.equal(status.body.buttons[0].value, null)
  })

  it('treats SK undefined-state PUT crash as success', async () => {
    app.putSelfPath = (_p, v, cb) => {
      app.puts.push({ path: _p, value: v })
      const err = new TypeError("Cannot read properties of undefined (reading 'state')")
      if (cb) cb(err)
      return Promise.reject(err)
    }
    plugin.start({
      buttons: [
        { mode: 'switch', label: 'Vertrek mode', path: 'electrical.switches.starlink.state' }
      ]
    })
    const routes = {}
    plugin.registerWithRouter({
      get () {},
      put (p, fn) { routes['PUT ' + p] = fn }
    })
    const ok = mockRes()
    await new Promise((resolve) => {
      const end = ok.end.bind(ok)
      ok.end = (s) => { end(s); resolve() }
      routes['PUT /buttons/:id'](
        { params: { id: '0' }, body: { value: 'toggle' }, readableEnded: true },
        ok
      )
    })
    assert.equal(ok.statusCode, 200)
    assert.equal(ok.body.buttons[0].on, true)
  })

  it('GET toggle on signalKApiRoutes flips a switch', async () => {
    plugin.start({
      buttons: [
        { mode: 'switch', label: 'Starlink', path: 'electrical.switches.starlink.state' }
      ]
    })
    const routes = {}
    plugin.signalKApiRoutes({
      get (p, fn) { routes['GET ' + p] = fn }
    })
    const ok = mockRes()
    await new Promise((resolve) => {
      const end = ok.end.bind(ok)
      ok.end = (s) => { end(s); resolve() }
      routes['GET /signalk-control-panel-plugin/buttons/:id/:state'](
        { params: { id: '0', state: 'toggle' } },
        ok
      )
    })
    assert.equal(ok.body.buttons[0].on, true)
    assert.equal(app.puts[0].value, 1)
  })

  it('retries PUT with mqtt source when SK reports multiple sources', async () => {
    app.getSelfPath = () => ({
      value: 0,
      $source: 'mqtt',
      values: {
        'signalk-control-panel-plugin': { value: 1 },
        mqtt: { value: 0 }
      }
    })
    const sources = []
    app.putSelfPath = (p, v, cb, source) => {
      sources.push(source || null)
      app.puts.push({ path: p, value: v, source: source || null })
      if (!source) {
        const err = new Error('there are multiple sources for the given path, but no source was specified in the request')
        err.statusCode = 400
        if (cb) cb({ statusCode: 400, message: err.message })
        return
      }
      if (cb) cb({ statusCode: 200 })
    }
    plugin.start({
      buttons: [
        { mode: 'switch', label: 'Plug', path: 'electrical.switches.plug.state' }
      ]
    })
    const routes = {}
    plugin.registerWithRouter({
      get () {},
      put (p, fn) { routes['PUT ' + p] = fn }
    })
    const ok = mockRes()
    await new Promise((resolve) => {
      const end = ok.end.bind(ok)
      ok.end = (s) => { end(s); resolve() }
      routes['PUT /buttons/:id'](
        { params: { id: '0' }, body: { value: 1 }, readableEnded: true },
        ok
      )
    })
    assert.equal(ok.statusCode, 200)
    assert.equal(ok.body.buttons[0].on, true)
    assert.deepEqual(sources, [null, 'mqtt'])
    assert.equal(app.putHandlers.length, 0)
  })
})
