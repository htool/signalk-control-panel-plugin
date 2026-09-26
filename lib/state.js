'use strict'

function token (value) {
  if (value === true || value === 1) return 'on'
  if (value === false || value === 0) return 'off'
  if (value == null) return 'unknown'
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase()
    if (s === '1' || s === 'on' || s === 'true' || s === 'online') return 'on'
    if (s === '0' || s === 'off' || s === 'false' || s === 'offline') return 'off'
    return 'unknown'
  }
  if (typeof value === 'number') return value ? 'on' : 'off'
  return 'unknown'
}

function isOn (value) {
  return token(value) === 'on'
}

function nextValue (value) {
  const on = isOn(value)
  if (typeof value === 'boolean') return !on
  if (typeof value === 'number') return on ? 0 : 1
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase()
    if (s === 'on' || s === 'off') return on ? 'off' : 'on'
    if (s === 'true' || s === 'false') return on ? 'false' : 'true'
    if (s === 'online' || s === 'offline') return on ? 'offline' : 'online'
    if (s === '1' || s === '0') return on ? '0' : '1'
  }
  return on ? 0 : 1
}

function latestSource (node) {
  if (node == null || typeof node !== 'object' || Array.isArray(node)) {
    return { value: node, timestamp: undefined }
  }
  const vals = node.values
  if (vals && typeof vals === 'object') {
    let best = null
    let bestTs = -Infinity
    Object.keys(vals).forEach((key) => {
      const row = vals[key]
      if (!row || typeof row !== 'object' || !Object.prototype.hasOwnProperty.call(row, 'value')) return
      const ts = Date.parse(row.timestamp || '')
      if (!Number.isFinite(ts) || ts < bestTs) return
      best = row
      bestTs = ts
    })
    if (best) return { value: best.value, timestamp: best.timestamp }
  }
  if (Object.prototype.hasOwnProperty.call(node, 'value')) {
    return { value: node.value, timestamp: node.timestamp }
  }
  return { value: node, timestamp: undefined }
}

function resolvePutValue (requested, current) {
  if (
    requested === undefined ||
    requested === null ||
    requested === '' ||
    requested === 'toggle'
  ) {
    return nextValue(current)
  }
  const wantOn = isOn(requested)
  if (wantOn === isOn(current) && current !== undefined && current !== null) {
    return current
  }
  if (wantOn !== isOn(current)) {
    const seed = current === undefined || current === null
      ? (wantOn ? 0 : 1)
      : current
    return nextValue(seed)
  }
  return requested
}

module.exports = {
  token,
  isOn,
  nextValue,
  latestSource,
  resolvePutValue
}
