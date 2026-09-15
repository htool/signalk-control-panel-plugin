'use strict'

function parseMode (value) {
  const s = String(value || 'switch').trim().toLowerCase()
  if (s === 'monitor' || s === 'view') return 'monitor'
  return 'switch'
}

function fallbackLabel (path, index) {
  const parts = String(path || '').split('.').filter(Boolean)
  const last = parts[parts.length - 1]
  if (last && last !== 'state' && last !== 'status' && last !== 'value') {
    return last
  }
  const prev = parts[parts.length - 2]
  if (prev) return prev
  return 'Button ' + (index + 1)
}

function parseButton (raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const path = typeof raw.path === 'string' ? raw.path.trim() : ''
  if (!path) return null
  const label =
    typeof raw.label === 'string' && raw.label.trim()
      ? raw.label.trim()
      : fallbackLabel(path, index)
  return {
    mode: parseMode(raw.mode || raw.type),
    label,
    path
  }
}

function parseButtons (list) {
  if (!Array.isArray(list)) return []
  const out = []
  list.forEach((raw, index) => {
    const button = parseButton(raw, index)
    if (button) out.push(button)
  })
  return out
}

function buttonSchema () {
  return {
    type: 'object',
    title: 'Button',
    properties: {
      mode: {
        type: 'string',
        title: 'Mode',
        enum: ['switch', 'monitor'],
        enumNames: ['Switch (toggle)', 'Monitor (view)'],
        default: 'switch'
      },
      label: {
        type: 'string',
        title: 'Label'
      },
      path: {
        type: 'string',
        title: 'Path',
        description: 'Signal K path under vessels.self'
      }
    }
  }
}

function pluginSchema () {
  return {
    type: 'object',
    properties: {
      buttons: {
        type: 'array',
        title: 'Buttons',
        description:
          'Each button is a switch (toggle) or a monitor (view) for one Signal K path.',
        items: buttonSchema(),
        default: []
      }
    }
  }
}

module.exports = {
  parseMode,
  fallbackLabel,
  parseButton,
  parseButtons,
  buttonSchema,
  pluginSchema
}
