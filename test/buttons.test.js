'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  parseMode,
  fallbackLabel,
  parseButtons,
  pluginSchema
} = require('../lib/buttons')

test('mode switch vs monitor, view is monitor', () => {
  assert.equal(parseMode('switch'), 'switch')
  assert.equal(parseMode('Switch (toggle)'), 'switch')
  assert.equal(parseMode('monitor'), 'monitor')
  assert.equal(parseMode('view'), 'monitor')
  assert.equal(parseMode(''), 'switch')
})

test('fallback label uses the useful path segment', () => {
  assert.equal(fallbackLabel('electrical.switches.starlink.state', 0), 'starlink')
  assert.equal(fallbackLabel('network.providers.starlink.status', 0), 'starlink')
  assert.equal(fallbackLabel('sensors.presence.dolphinshelly', 2), 'dolphinshelly')
  assert.equal(fallbackLabel('', 3), 'Button 4')
})

test('parseButtons keeps mode label path and skips empty paths', () => {
  const buttons = parseButtons([
    { mode: 'switch', label: 'Starlink', path: 'electrical.switches.starlink.state' },
    { type: 'view', path: 'network.providers.starlink.status' },
    { mode: 'monitor', label: '  ', path: '  ' },
    { label: 'Ignore' }
  ])
  assert.equal(buttons.length, 2)
  assert.deepEqual(buttons[0], {
    mode: 'switch',
    label: 'Starlink',
    path: 'electrical.switches.starlink.state'
  })
  assert.equal(buttons[1].mode, 'monitor')
  assert.equal(buttons[1].label, 'starlink')
  assert.equal(buttons[1].path, 'network.providers.starlink.status')
})

test('plugin schema exposes mode label and path per button', () => {
  const schema = pluginSchema()
  const props = schema.properties.buttons.items.properties
  assert.deepEqual(props.mode.enum, ['switch', 'monitor'])
  assert.deepEqual(props.mode.enumNames, ['Switch (toggle)', 'Monitor (view)'])
  assert.equal(props.label.title, 'Label')
  assert.equal(props.path.title, 'Path')
  assert.equal(props.persist, undefined)
})
