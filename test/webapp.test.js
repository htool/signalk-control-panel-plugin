'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

test('package.json advertises a webapp with icon and Handset font', () => {
  const pkg = require('../package.json')
  assert.ok(pkg.keywords.includes('signalk-webapp'))
  assert.ok(pkg.keywords.includes('signalk-node-server-plugin'))
  assert.equal(pkg.signalk.appIcon, 'icon.png')
  assert.equal(pkg.signalk.displayName, 'Control Panel')
  const pub = path.join(__dirname, '..', 'public')
  assert.equal(fs.existsSync(path.join(pub, 'icon.png')), true)
  assert.equal(fs.existsSync(path.join(pub, 'HandsetCond.ttf')), true)
  assert.equal(fs.existsSync(path.join(pub, 'index.html')), true)
  assert.equal(fs.existsSync(path.join(pub, 'app.js')), true)
  assert.equal(fs.existsSync(path.join(pub, 'style.css')), true)
})

test('webapp uses HandsetCond and follows display light/dark', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8')
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8')
  assert.match(css, /HandsetCond\.ttf/)
  assert.match(css, /font-family:\s*Handset/)
  assert.match(css, /prefers-color-scheme:\s*light/)
  assert.match(html, /prefers-color-scheme:\s*dark/)
  assert.match(html, /viewport-fit=cover/)
  assert.match(css, /safe-area-inset-top/)
})

test('switch keys are green on and transparent off; monitors are green/red', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8')
  assert.match(css, /\.key\.switch\.on[\s\S]*background:\s*var\(--on\)/)
  assert.match(css, /\.key\.switch\.off[\s\S]*background:\s*transparent/)
  assert.match(css, /\.key\.monitor\.on[\s\S]*background:\s*var\(--on\)/)
  assert.match(css, /\.key\.monitor\.off[\s\S]*background:\s*var\(--off\)/)
})

test('plugin source registers readonly status and write toggle', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'index.js'), 'utf8')
  assert.match(src, /plugin\.signalKApiRoutes/)
  assert.match(src, /router\.get\('\/' \+ PLUGIN_ID \+ '\/status'/)
  assert.match(src, /router\.get\('\/' \+ PLUGIN_ID \+ '\/buttons\/:id\/:state'/)
  assert.match(src, /plugin\.registerWithRouter/)
  assert.match(src, /write\.put\('\/buttons\/:id'/)
})
