'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { token, isOn, nextValue, latestSource, resolvePutValue } = require('../lib/state')

test('on tokens include 1 true on online', () => {
  ;[1, true, '1', 'on', 'ON', 'true', 'True', 'online', 'ONLINE'].forEach((v) => {
    assert.equal(token(v), 'on', String(v))
    assert.equal(isOn(v), true, String(v))
  })
})

test('off tokens include 0 false off offline', () => {
  ;[0, false, '0', 'off', 'OFF', 'false', 'False', 'offline', 'OFFLINE'].forEach((v) => {
    assert.equal(token(v), 'off', String(v))
    assert.equal(isOn(v), false, String(v))
  })
})

test('unknown values are not on', () => {
  ;[null, undefined, '', 'connecting', 'maybe'].forEach((v) => {
    assert.equal(isOn(v), false, String(v))
  })
})

test('nextValue keeps the current type', () => {
  assert.equal(nextValue(true), false)
  assert.equal(nextValue(false), true)
  assert.equal(nextValue(1), 0)
  assert.equal(nextValue(0), 1)
  assert.equal(nextValue('on'), 'off')
  assert.equal(nextValue('off'), 'on')
  assert.equal(nextValue('true'), 'false')
  assert.equal(nextValue('online'), 'offline')
  assert.equal(nextValue('1'), '0')
  assert.equal(nextValue(undefined), 1)
})

test('latestSource picks the newest timestamp when several sources share a path', () => {
  const picked = latestSource({
    value: 1,
    $source: 'signalk-naviop-plugin',
    timestamp: '2026-09-25T08:54:01.000Z',
    values: {
      'signalk-naviop-plugin': { value: 1, timestamp: '2026-09-25T08:54:01.000Z' },
      'signalk-automation-plugin': { value: 0, timestamp: '2026-09-25T11:42:22.000Z' }
    }
  })
  assert.equal(picked.value, 0)
  assert.equal(picked.timestamp, '2026-09-25T11:42:22.000Z')
  assert.equal(latestSource(0).value, 0)
  assert.equal(latestSource({ value: false }).value, false)
})

test('resolvePutValue toggles or matches requested state', () => {
  assert.equal(resolvePutValue('toggle', 0), 1)
  assert.equal(resolvePutValue(undefined, 'on'), 'off')
  assert.equal(resolvePutValue(1, false), true)
  assert.equal(resolvePutValue('off', true), false)
  assert.equal(resolvePutValue('online', 'offline'), 'online')
  assert.equal(resolvePutValue(1, 1), 1)
})
