'use strict'

const { isOn, resolvePutValue } = require('../lib/state')
const { parseButtons, pluginSchema } = require('../lib/buttons')
const { putSelfPath } = require('../lib/put')

const PLUGIN_ID = 'signalk-control-panel-plugin'

function sendJson (res, body, status) {
  res.statusCode = status || 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readJson (req) {
  return new Promise((resolve, reject) => {
    const parsed = req.body
    const hasParsed =
      parsed &&
      typeof parsed === 'object' &&
      !Buffer.isBuffer(parsed) &&
      Object.keys(parsed).length > 0
    if (hasParsed || req.readableEnded) {
      resolve(
        hasParsed
          ? parsed
          : parsed && typeof parsed === 'object' && !Buffer.isBuffer(parsed)
            ? parsed
            : {}
      )
      return
    }
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 1e6) reject(new Error('body too large'))
    })
    req.on('end', () => {
      if (!raw) {
        resolve(
          parsed && typeof parsed === 'object' && !Buffer.isBuffer(parsed)
            ? parsed
            : {}
        )
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function readPath (app, p) {
  if (!p || typeof app.getSelfPath !== 'function') return undefined
  const v = app.getSelfPath(p)
  if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'value')) {
    return v.value
  }
  return v
}

function parseId (value) {
  const n = parseInt(value, 10)
  if (!Number.isInteger(n) || n < 0) return -1
  return n
}

module.exports = function (app) {
  const plugin = {}
  plugin.id = PLUGIN_ID
  plugin.name = 'Control Panel'
  plugin.description =
    'Stream Deck-style webapp for Signal K state switches and monitors'

  let options = {}
  let started = false
  let values = Object.create(null)
  const unsubscribes = []

  plugin.schema = pluginSchema()

  function currentButtons () {
    return parseButtons(options.buttons)
  }

  function pathValue (path) {
    if (Object.prototype.hasOwnProperty.call(values, path)) return values[path]
    return readPath(app, path)
  }

  function snapshot () {
    if (!started) {
      return { started: false, buttons: [] }
    }
    return {
      started: true,
      buttons: currentButtons().map((button, id) => {
        const raw = pathValue(button.path)
        return {
          id,
          mode: button.mode,
          label: button.label,
          path: button.path,
          value: raw === undefined ? null : raw,
          on: isOn(raw)
        }
      })
    }
  }

  function clearSubs () {
    while (unsubscribes.length) {
      const u = unsubscribes.pop()
      try {
        u()
      } catch (_) {}
    }
  }

  function subscribe () {
    clearSubs()
    values = Object.create(null)
    const buttons = currentButtons()
    const paths = []
    const seen = Object.create(null)
    buttons.forEach((button) => {
      if (!button.path || seen[button.path]) return
      seen[button.path] = true
      paths.push(button.path)
      values[button.path] = readPath(app, button.path)
    })
    if (!paths.length || !app.subscriptionmanager) return
    app.subscriptionmanager.subscribe(
      {
        context: 'vessels.self',
        subscribe: paths.map((p) => ({
          path: p,
          period: 200,
          policy: 'instant'
        }))
      },
      unsubscribes,
      (err) => {
        if (err && app.error) app.error(err)
      },
      (delta) => {
        ;(delta.updates || []).forEach((update) => {
          ;(update.values || []).forEach((v) => {
            if (v && v.path) values[v.path] = v.value
          })
        })
      }
    )
  }

  async function setButton (id, requested) {
    const buttons = currentButtons()
    const button = buttons[id]
    if (!button) {
      const err = new Error('Unknown button ' + id)
      err.status = 404
      throw err
    }
    if (button.mode !== 'switch') {
      const err = new Error(button.label + ' is a monitor')
      err.status = 400
      throw err
    }
    const current = pathValue(button.path)
    const next = resolvePutValue(requested, current)
    await putSelfPath(app, PLUGIN_ID, button.path, next)
    values[button.path] = next
    return snapshot()
  }

  plugin.start = function (opts) {
    options = opts || {}
    started = true
    subscribe()
    if (app.setPluginStatus) {
      const n = currentButtons().length
      app.setPluginStatus(n === 1 ? '1 button' : n + ' buttons')
    }
  }

  plugin.stop = function () {
    started = false
    options = {}
    values = Object.create(null)
    clearSubs()
  }

  function handleStatus (req, res) {
    sendJson(res, snapshot())
  }

  function handleSet (id, requested, res) {
    setButton(id, requested)
      .then((body) => sendJson(res, body))
      .catch((err) => sendJson(res, { error: err.message }, err.status || 400))
  }

  plugin.registerWithRouter = function (router) {
    router.get('/status', handleStatus)
    const write = typeof router.access === 'function' ? router.access('readwrite') : router
    write.put('/buttons/:id', (req, res) => {
      const id = parseId(req.params.id)
      if (id < 0) {
        sendJson(res, { error: 'Unknown button' }, 404)
        return
      }
      readJson(req)
        .then((body) => {
          const requested =
            body && Object.prototype.hasOwnProperty.call(body, 'value')
              ? body.value
              : 'toggle'
          handleSet(id, requested, res)
        })
        .catch((err) => sendJson(res, { error: err.message }, 400))
    })
  }

  plugin.signalKApiRoutes = function (router) {
    router.get('/' + PLUGIN_ID + '/status', handleStatus)
    router.get('/' + PLUGIN_ID + '/buttons/:id/:state', (req, res) => {
      const id = parseId(req.params.id)
      if (id < 0) {
        sendJson(res, { error: 'Unknown button' }, 404)
        return
      }
      handleSet(id, req.params.state, res)
    })
    return router
  }

  return plugin
}
