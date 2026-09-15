'use strict'

function putSelfPath (app, pluginId, path, value) {
  return new Promise((resolve, reject) => {
    if (typeof app.putSelfPath !== 'function') {
      if (typeof app.handleMessage === 'function') {
        app.handleMessage(pluginId, {
          updates: [{ values: [{ path, value }] }]
        })
      }
      resolve()
      return
    }
    let settled = false
    const finish = (err) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }
    const fromReply = (reply) => {
      if (reply == null) return finish(null)
      if (reply instanceof Error) return finish(reply)
      const code = reply.statusCode
      if (typeof code === 'number' && code >= 400) {
        finish(new Error(reply.message || ('PUT failed (' + code + ') for ' + path)))
        return
      }
      finish(null)
    }
    try {
      const ret = app.putSelfPath(path, value, fromReply)
      if (ret && typeof ret.then === 'function') {
        ret.then(fromReply, finish)
      }
    } catch (err) {
      finish(err)
    }
  })
}

module.exports = { putSelfPath }
