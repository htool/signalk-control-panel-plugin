'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

function makeApp (paths) {
  const store = Object.assign({}, paths)
  const puts = []
  return {
    debug: () => {},
    error: () => {},
    setPluginStatus: () => {},
    getSelfPath: (p) => store[p],
    handleMessage: () => {},
    putSelfPath: (p, v, cb) => {
      puts.push({ path: p, value: v })
      store[p] = v
      if (cb) cb(null)
    },
    puts,
    subscriptionmanager: {
      subscribe: (_sub, unsubscribes) => {
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
    assert.equal(res.body.buttons[1].on, true)
    assert.equal(res.body.buttons[1].mode, 'monitor')
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
})
