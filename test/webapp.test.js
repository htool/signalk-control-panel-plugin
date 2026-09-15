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
  assert.match(css, /backdrop-filter:\s*blur/)
  assert.match(css, /\.key\.switch\.on[\s\S]*background:\s*var\(--glass-on\)/)
  assert.match(css, /\.key\.switch\.off[\s\S]*background:\s*var\(--glass-clear\)/)
  assert.match(css, /\.key\.monitor\.on[\s\S]*background:\s*var\(--glass-on\)/)
  assert.match(css, /\.key\.monitor\.off[\s\S]*background:\s*var\(--glass-off\)/)
})

test('keys use milk glass and a fixed label size on mobile and desktop', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8')
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8')
  assert.doesNotMatch(html, /glassPicker/)
  assert.match(css, /--glass-on:\s*rgba\(46, 214, 110, 0\.7\)/)
  assert.match(css, /\.key[\s\S]*font-size:\s*1\.55rem/)
  assert.doesNotMatch(css, /\.key[\s\S]*font-size:\s*clamp/)
})

test('login form asks the browser to remember credentials', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8')
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8')
  assert.match(html, /autocomplete="username"/)
  assert.match(html, /autocomplete="current-password"/)
  assert.match(html, /autocomplete="on"/)
  assert.match(js, /mediation:\s*'required'/)
  assert.match(js, /PasswordCredential/)
})

test('plugin source registers readonly status and write toggle', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'index.js'), 'utf8')
  assert.match(src, /plugin\.signalKApiRoutes/)
  assert.match(src, /router\.get\('\/' \+ PLUGIN_ID \+ '\/status'/)
  assert.match(src, /router\.get\('\/' \+ PLUGIN_ID \+ '\/buttons\/:id\/:state'/)
  assert.match(src, /plugin\.registerWithRouter/)
  assert.match(src, /write\.put\('\/buttons\/:id'/)
})
