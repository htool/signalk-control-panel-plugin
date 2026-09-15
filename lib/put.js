'use strict'

function emitPath (app, pluginId, path, value) {
  if (typeof app.handleMessage === 'function') {
    app.handleMessage(pluginId, {
      updates: [{ values: [{ path, value }] }]
    })
  }
}

function isBenignUndefinedReply (err) {
  const m = String((err && err.message) || err || '')
  return /Cannot read propert(?:y|ies) of undefined/i.test(m)
}

function isMissingPut (err) {
  if (!err) return false
  const m = String(err.message || err)
  const code = err.statusCode
  return (
    code === 404 ||
    code === 405 ||
    /PUT not supported/i.test(m) ||
    /not found/i.test(m)
  )
}

function putSelfPath (app, pluginId, path, value) {
  return new Promise((resolve, reject) => {
    if (typeof app.putSelfPath !== 'function') {
      emitPath(app, pluginId, path, value)
      resolve({ created: true })
      return
    }
    let settled = false
    const finish = (err, extra) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(extra || {})
    }
    const fromReply = (reply) => {
      if (reply == null) return finish(null)
      if (reply instanceof Error) {
        if (isBenignUndefinedReply(reply)) return finish(null)
        return finish(reply)
      }
      const code = reply.statusCode
      if (typeof code === 'number' && code >= 400) {
        const err = new Error(reply.message || ('PUT failed (' + code + ') for ' + path))
        err.statusCode = code
        finish(err)
        return
      }
      finish(null)
    }
    try {
      const ret = app.putSelfPath(path, value, fromReply)
      if (ret && typeof ret.then === 'function') {
        ret.then(fromReply, (err) => {
          if (isBenignUndefinedReply(err)) finish(null)
          else finish(err)
        })
      }
    } catch (err) {
      if (isBenignUndefinedReply(err)) finish(null)
      else finish(err)
    }
  })
}

async function putOrCreate (app, pluginId, path, value) {
  try {
    return await putSelfPath(app, pluginId, path, value)
  } catch (err) {
    if (!isMissingPut(err) && !isBenignUndefinedReply(err)) throw err
    emitPath(app, pluginId, path, value)
    return { created: true }
  }
}

module.exports = {
  emitPath,
  isBenignUndefinedReply,
  isMissingPut,
  putSelfPath,
  putOrCreate
}
