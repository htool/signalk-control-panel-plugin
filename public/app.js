/* Zeus / Navico MFD: ES5, XHR, no fetch/async/await. */
var PLUGIN = 'signalk-control-panel-plugin'
var API_READ = '/signalk/v1/api/' + PLUGIN
var API_WRITE = '/plugins/' + PLUGIN
var TOKEN_KEY = 'skDeviceToken'
var CLIENT_KEY = 'skDeviceClientId'
var HREF_KEY = 'skDeviceHref'
var POSTED_KEY = 'skDevicePosted'

var authToken = ''
var loggedIn = false
var authRequired = true
var buttons = []
var putting = null
var slide = null
var devicePending = false
var pollTimer = null
var pollHref = ''
var deadHrefs = {}
var postInFlight = false
var postedOnce = false
var memoryClientId = ''
var memoryHref = ''

try {
  authToken = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem('skAuthToken') || ''
  postedOnce = localStorage.getItem(POSTED_KEY) === '1'
} catch (e) {}

function el (id) { return document.getElementById(id) }

function uuid () {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0
    var v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function storageGet (key) {
  try { return localStorage.getItem(key) || '' } catch (e) { return '' }
}

function storageSet (key, value) {
  try { localStorage.setItem(key, value) } catch (e) {}
}

function storageDel (key) {
  try { localStorage.removeItem(key) } catch (e) {}
}

function markPosted () {
  postedOnce = true
  storageSet(POSTED_KEY, '1')
}

function clearPosted () {
  postedOnce = false
  storageDel(POSTED_KEY)
}

function getClientId () {
  if (memoryClientId) return memoryClientId
  var id = storageGet(CLIENT_KEY)
  if (!id) id = uuid()
  memoryClientId = id
  storageSet(CLIENT_KEY, id)
  return memoryClientId
}

function saveToken (token) {
  authToken = token || ''
  if (authToken) {
    storageSet(TOKEN_KEY, authToken)
    try { sessionStorage.setItem('skAuthToken', authToken) } catch (e) {}
  } else {
    storageDel(TOKEN_KEY)
    try { sessionStorage.removeItem('skAuthToken') } catch (e) {}
  }
}

function http (opts, cb) {
  var xhr = new XMLHttpRequest()
  xhr.open(opts.method || 'GET', opts.url, true)
  xhr.withCredentials = opts.credentials !== false
  if (opts.body) xhr.setRequestHeader('Content-Type', 'application/json')
  if (opts.auth !== false && authToken) xhr.setRequestHeader('Authorization', 'Bearer ' + authToken)
  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return
    var data = {}
    try { data = xhr.responseText ? JSON.parse(xhr.responseText) : {} } catch (err) {
      data = { error: xhr.responseText }
    }
    cb(xhr.status, data)
  }
  xhr.onerror = function () {
    cb(0, {})
  }
  xhr.send(opts.body ? JSON.stringify(opts.body) : null)
}

function setConnection (ok) {
  var line = el('statusLine')
  if (!line) return
  if (ok) {
    line.textContent = 'Connected'
    line.className = 'meta connected'
  } else {
    line.textContent = 'No connection...'
    line.className = 'meta offline'
  }
}

function isAuthorized () {
  return loggedIn || !!authToken
}

function setApproved () {
  devicePending = false
  renderLogin()
}

function setHidden (node, hide) {
  if (!node) return
  if (hide) node.className = (node.className || '').replace(/\bis-hidden\b/g, '') + ' is-hidden'
  else node.className = (node.className || '').replace(/\bis-hidden\b/g, '').replace(/\s+/g, ' ').replace(/^\s|\s$/g, '')
}

function renderLogin () {
  var pending = el('devicePending')
  setHidden(pending, !devicePending)
}

function httpError (status, data, url) {
  if (status === 401) {
    if (url && String(url).indexOf('/plugins/') !== -1) {
      return new Error('Approve this device in Signal K')
    }
    loggedIn = false
    saveToken('')
    renderLogin()
    return new Error('Approve this device in Signal K')
  }
  return new Error((data && (data.error || data.message)) || (status + ' ' + url))
}

function getJson (url, cb) {
  http({ method: 'GET', url: url }, function (status, data) {
    if (status < 200 || status >= 300) return cb(httpError(status, data, url))
    cb(null, data)
  })
}

function sendJson (url, method, body, cb) {
  http({ method: method, url: url, body: body || {} }, function (status, data) {
    if (status < 200 || status >= 300) return cb(httpError(status, data, url))
    cb(null, data)
  })
}

function stopDevicePoll () {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function deviceRequestGone (status, data) {
  if (status === 404) return true
  if (status !== 500) return false
  var msg = ''
  if (data) {
    if (data.error) msg = String(data.error)
    else if (data.message) msg = String(data.message)
  }
  return msg.indexOf('not found') !== -1 || msg.indexOf('Unable to check request') !== -1
}

function startHrefPoll (href) {
  if (!href || deadHrefs[href]) return
  pollHref = href
  memoryHref = href
  storageSet(HREF_KEY, href)
  if (!pollTimer) {
    pollTimer = setInterval(function () { pollDeviceHref(pollHref) }, 3000)
  }
  pollDeviceHref(href)
}

function applyLogin (token) {
  if (token) saveToken(token)
  loggedIn = true
  devicePending = false
  stopDevicePoll()
  storageDel(HREF_KEY)
  renderLogin()
}

function pollDeviceHref (href) {
  http({ method: 'GET', url: href, auth: false, credentials: false }, function (status, data) {
    if (deviceRequestGone(status, data)) {
      deadHrefs[href] = true
      stopDevicePoll()
      if (memoryHref === href) memoryHref = ''
      if (pollHref === href) pollHref = ''
      storageDel(HREF_KEY)
      if (!authToken) clearPosted()
      if (authToken) return
      return
    }
    var ar = data && data.accessRequest
    if (ar && ar.permission === 'APPROVED' && ar.token) {
      applyLogin(ar.token)
      loadStatus(function () {})
      return
    }
    if (ar && ar.permission === 'DENIED') {
      devicePending = false
      clearPosted()
      renderLogin()
      stopDevicePoll()
    }
  })
}

function submitDeviceRequest () {
  if (postInFlight || isAuthorized()) return
  postInFlight = true
  markPosted()
  var body = {
    clientId: getClientId(),
    description: 'Control Panel',
    permissions: 'readwrite'
  }
  http({ method: 'POST', url: '/signalk/v1/access/requests', body: body, auth: false, credentials: false }, function (status, data) {
    postInFlight = false
    if (data && data.token) {
      applyLogin(data.token)
      loadStatus(function () {})
      return
    }
    var already = data && data.message && String(data.message).indexOf('already requested') !== -1
    if (status === 400 && already) {
      devicePending = true
      renderLogin()
      var keep = memoryHref || storageGet(HREF_KEY)
      if (keep && !deadHrefs[keep]) startHrefPoll(keep)
      return
    }
    if (status === 202 && data && data.href) {
      startHrefPoll(data.href)
      devicePending = true
      renderLogin()
      return
    }
    var href = memoryHref || storageGet(HREF_KEY)
    if (href && !deadHrefs[href]) {
      devicePending = true
      renderLogin()
      startHrefPoll(href)
      return
    }
    if (status === 404) {
      renderLogin()
      return
    }
    devicePending = true
    renderLogin()
  })
}

function startDeviceRequest () {
  if (!authRequired || isAuthorized() || postInFlight) return
  var href = memoryHref || storageGet(HREF_KEY)
  if (href && !deadHrefs[href]) {
    devicePending = true
    renderLogin()
    startHrefPoll(href)
    return
  }
  if (postedOnce) return
  submitDeviceRequest()
}

function checkLogin (cb) {
  http({ method: 'GET', url: '/skServer/loginStatus' }, function (status, data) {
    if (status >= 200 && status < 300) {
      authRequired = data.authenticationRequired !== false
      loggedIn = data.status === 'loggedIn' || !!authToken
    } else {
      authRequired = true
      loggedIn = !!authToken
    }
    if (isAuthorized()) setApproved()
    else renderLogin()
    cb()
  })
}

function escapeHtml (s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

var paintedSig = ''

function deckSignature (list) {
  var i, b, parts = []
  for (i = 0; i < list.length; i++) {
    b = list[i]
    parts.push(String(b.id) + ':' + b.mode + ':' + (b.slider ? 's' : '') + ':' + b.label)
  }
  return parts.join('|')
}

function isSliderKey (button) {
  return !!(button && button.slider && button.mode !== 'monitor')
}

function keyClass (button) {
  var on = button.on ? ' on' : ' off'
  if (isSliderKey(button)) return 'key slider' + on
  var role = button.mode === 'monitor' ? 'monitor' : 'switch'
  return 'key ' + role + on
}

function paintKeyState (key, button) {
  var extra = hasSliderClass(key) && (' ' + (key.className || '') + ' ').indexOf(' is-sliding ') >= 0
    ? ' is-sliding'
    : ''
  key.className = keyClass(button) + extra
  if (putting === button.id) key.setAttribute('disabled', 'disabled')
  else key.removeAttribute('disabled')
}

function updateKeys () {
  var keys = el('deck').getElementsByClassName('key')
  var i, button
  if (keys.length !== buttons.length) return false
  for (i = 0; i < buttons.length; i++) {
    button = buttons[i]
    if (String(keys[i].getAttribute('data-id')) !== String(button.id)) return false
    if (slide && slide.id === button.id) continue
    paintKeyState(keys[i], button)
  }
  return true
}

function renderDeck () {
  var deck = el('deck')
  var html = []
  var i, button, role, sig
  if (!buttons.length) {
    deck.innerHTML = '<p class="empty">No buttons configured. Add switch or monitor buttons in plugin config.</p>'
    paintedSig = ''
    return
  }
  sig = deckSignature(buttons)
  if (sig === paintedSig && updateKeys()) return
  for (i = 0; i < buttons.length; i++) {
    button = buttons[i]
    if (isSliderKey(button)) {
      html.push(
        '<div class="' + keyClass(button) + '" data-id="' + button.id + '" data-mode="slider">' +
          '<div class="slider-track">' +
            '<div class="slider-fill"></div>' +
            '<div class="slider-knob"></div>' +
            '<span class="label">' + escapeHtml(button.label) + '</span>' +
          '</div>' +
        '</div>'
      )
    } else {
      role = button.mode === 'monitor' ? 'monitor' : 'switch'
      html.push(
        '<button type="button" class="' + keyClass(button) + '" data-id="' + button.id + '" data-mode="' + role + '">' +
          '<span class="label">' + escapeHtml(button.label) + '</span>' +
        '</button>'
      )
    }
  }
  deck.innerHTML = html.join('')
  paintedSig = sig
  updateKeys()
  layoutKeys()
  fitLabels()
}

function isPhoneWidth () {
  var w = window.innerWidth || document.documentElement.clientWidth || 1024
  return w < 768
}

var MIN_KEY = 72
var SLIDER_H = 72

function availableDeckHeight () {
  var main = document.getElementsByTagName('main')[0]
  if (main && main.clientHeight > 0) return Math.floor(main.clientHeight)
  var h = window.innerHeight || document.documentElement.clientHeight || 600
  var header = document.getElementsByTagName('header')[0]
  var footer = document.getElementsByTagName('footer')[0]
  var pad = 0
  try {
    var cs = window.getComputedStyle(document.body)
    pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
  } catch (e) {}
  if (header) h -= header.offsetHeight
  if (footer) h -= footer.offsetHeight
  h -= pad
  if (h < 160) h = 160
  return Math.floor(h)
}

function hasSliderClass (node) {
  return node && (' ' + (node.className || '') + ' ').indexOf(' slider ') >= 0
}

function layoutKeys () {
  var deck = el('deck')
  var keys = deck.getElementsByClassName('key')
  var squares = []
  var sliders = []
  var n, i, lab, size, cols, gap, deckW, phone, rows, maxCols, c, sw, sh, s, best, bestCols, availH, half, keyH, sliderH

  for (i = 0; i < keys.length; i++) {
    if (hasSliderClass(keys[i])) sliders.push(keys[i])
    else squares.push(keys[i])
  }
  n = squares.length
  deckW = deck.clientWidth
  phone = isPhoneWidth()
  gap = 8
  if (!phone) {
    for (i = 0; i < squares.length; i++) {
      squares[i].style.width = ''
      squares[i].style.height = ''
      squares[i].style.margin = ''
      lab = squares[i].getElementsByClassName('label')[0]
      if (lab) {
        lab.style.width = ''
        lab.style.height = ''
        lab.style.maxWidth = ''
      }
    }
    for (i = 0; i < sliders.length; i++) {
      sliders[i].style.width = ''
      sliders[i].style.height = ''
      sliders[i].style.margin = ''
      lab = sliders[i].getElementsByClassName('label')[0]
      if (lab) {
        lab.style.width = ''
        lab.style.height = ''
        lab.style.maxWidth = ''
        lab.style.lineHeight = ''
      }
    }
    return
  }
  availH = availableDeckHeight()
  maxCols = 4
  if (deckW < 540) maxCols = 3
  if (deckW < 380) maxCols = 2
  best = 0
  bestCols = 2
  sliderH = sliders.length ? SLIDER_H : 0
  if (n) {
    for (c = 2; c <= maxCols; c++) {
      rows = Math.ceil(n / c)
      sw = Math.floor((deckW - gap * c) / c)
      sh = Math.floor((availH - sliders.length * (SLIDER_H + gap) - gap * rows) / rows)
      s = sw
      if (sh < s) s = sh
      if (s > best) {
        best = s
        bestCols = c
      }
    }
    cols = bestCols
    rows = Math.ceil(n / cols)
    sw = Math.floor((deckW - gap * cols) / cols)
    keyH = Math.floor((availH - sliders.length * (SLIDER_H + gap) - gap * rows) / rows)
    if (keyH < 48) keyH = 48
    size = sw
    if (size < 48) size = 48
    half = Math.floor(gap / 2)
    for (i = 0; i < n; i++) {
      squares[i].style.width = size + 'px'
      squares[i].style.height = keyH + 'px'
      squares[i].style.margin = half + 'px'
      lab = squares[i].getElementsByClassName('label')[0]
      if (lab) {
        lab.style.width = size + 'px'
        lab.style.height = keyH + 'px'
        lab.style.maxWidth = size + 'px'
      }
    }
  }
  for (i = 0; i < sliders.length; i++) {
    sliders[i].style.width = deckW + 'px'
    sliders[i].style.height = sliderH + 'px'
    sliders[i].style.margin = Math.floor(gap / 2) + 'px 0'
    lab = sliders[i].getElementsByClassName('label')[0]
    if (lab) {
      lab.style.width = ''
      lab.style.height = sliderH + 'px'
      lab.style.maxWidth = ''
      lab.style.lineHeight = sliderH + 'px'
    }
    if (!(slide && slide.el === sliders[i])) resetSliderKnob(sliders[i])
  }
}

function fitLabels () {
  var keys = document.getElementsByClassName('key')
  var probe = document.createElement('span')
  var i, key, lab, words, size, inner, j, longest
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap'
  document.body.appendChild(probe)
  for (i = 0; i < keys.length; i++) {
    key = keys[i]
    lab = key.getElementsByClassName('label')[0]
    if (!lab) continue
    inner = key.clientWidth - 16
    if (hasSliderClass(key)) inner = key.clientWidth - 88
    words = (lab.textContent || '').replace(/^\s+|\s+$/g, '').split(/\s+/)
    size = key.clientWidth / 80
    if (hasSliderClass(key)) size = 1.25
    if (size > 1.55) size = 1.55
    if (size < 0.95) size = 0.95
    probe.style.fontFamily = 'Handset, ui-sans-serif, system-ui, sans-serif'
    function longestWord (fs) {
      longest = 0
      probe.style.fontSize = fs + 'rem'
      for (j = 0; j < words.length; j++) {
        probe.textContent = words[j]
        if (probe.offsetWidth > longest) longest = probe.offsetWidth
      }
      return longest
    }
    while (longestWord(size) > inner && size > 0.95) {
      size = size - 0.05
    }
    lab.style.fontSize = size + 'rem'
  }
  document.body.removeChild(probe)
}

function loadStatus (cb) {
  var opts = { method: 'GET', url: API_READ + '/status', credentials: false }
  if (!authToken) opts.auth = false
  http(opts, function (status, data) {
    if (status < 200 || status >= 300) {
      if (status === 401) {
        saveToken('')
        if (!loggedIn) setApproved()
        setConnection(true)
      } else {
        setConnection(false)
      }
      if (cb) cb(new Error('status'))
      return
    }
    buttons = data.buttons || []
    setApproved()
    setConnection(true)
    renderDeck()
    if (cb) cb(null)
  })
}

function applyToggleResult (err, data) {
  putting = null
  if (err) {
    if (!isAuthorized()) startDeviceRequest()
  } else {
    loggedIn = true
    setApproved()
    buttons = (data && data.buttons) || buttons
  }
  renderDeck()
}

function setSwitch (button) {
  if (button.mode !== 'switch' || putting != null) return
  putting = button.id
  renderDeck()
  sendJson(API_WRITE + '/buttons/' + button.id, 'PUT', { value: 'toggle' }, function (err, data) {
    if (!err) {
      applyToggleResult(null, data)
      return
    }
    getJson(API_READ + '/buttons/' + button.id + '/toggle', function (err2, data2) {
      applyToggleResult(err2, data2)
    })
  })
}

function closestKey (node) {
  while (node && node !== document) {
    if (node.className && (' ' + node.className + ' ').indexOf(' key ') >= 0) return node
    node = node.parentNode
  }
  return null
}

function closestSlider (node) {
  while (node && node !== document) {
    if (node.getAttribute && node.getAttribute('data-mode') === 'slider') return node
    node = node.parentNode
  }
  return null
}

function eventPageX (ev) {
  if (ev.touches && ev.touches[0]) return ev.touches[0].clientX
  if (ev.changedTouches && ev.changedTouches[0]) return ev.changedTouches[0].clientX
  return ev.clientX
}

function setSliderPos (node, x) {
  var knob = node && node.getElementsByClassName('slider-knob')[0]
  var fill = node && node.getElementsByClassName('slider-fill')[0]
  var half
  if (!knob) return
  if (x < 4) x = 4
  knob.style.left = x + 'px'
  half = knob.offsetWidth ? Math.floor(knob.offsetWidth / 2) : 32
  if (fill) fill.style.width = (x + half) + 'px'
}

function resetSliderKnob (node) {
  setSliderPos(node, 4)
}

function onSlideStart (ev) {
  var node = closestSlider(ev.target || ev.srcElement)
  var knob, local, max
  if (!node || putting != null || slide) return
  knob = node.getElementsByClassName('slider-knob')[0]
  if (!knob) return
  local = eventPageX(ev) - node.getBoundingClientRect().left
  if (local > knob.offsetWidth + 28) return
  max = node.clientWidth - knob.offsetWidth - 8
  if (max < 24) return
  slide = {
    el: node,
    knob: knob,
    id: parseInt(node.getAttribute('data-id'), 10),
    origin: eventPageX(ev) - knob.offsetLeft,
    max: max
  }
  node.className = (node.className || '').replace(/\bis-sliding\b/g, '') + ' is-sliding'
  if (ev.preventDefault) ev.preventDefault()
  if (ev.stopPropagation) ev.stopPropagation()
}

function onSlideMove (ev) {
  var x
  if (!slide) return
  x = eventPageX(ev) - slide.origin
  if (x < 4) x = 4
  if (x > slide.max + 4) x = slide.max + 4
  setSliderPos(slide.el, x)
  if (ev.preventDefault) ev.preventDefault()
}

function onSlideEnd (ev) {
  var node, id, i, button, travelled
  if (!slide) return
  node = slide.el
  id = slide.id
  travelled = slide.knob.offsetLeft - 4
  node.className = (node.className || '').replace(/\bis-sliding\b/g, '').replace(/\s+/g, ' ')
  if (travelled < slide.max * 0.85) {
    slide = null
    resetSliderKnob(node)
    return
  }
  slide = null
  resetSliderKnob(node)
  for (i = 0; i < buttons.length; i++) {
    if (buttons[i].id === id) {
      button = buttons[i]
      break
    }
  }
  if (button) setSwitch(button)
  if (ev && ev.preventDefault) ev.preventDefault()
}

el('deck').onclick = function (ev) {
  var btn = closestKey(ev.target || ev.srcElement)
  if (!btn || btn.getAttribute('data-mode') !== 'switch') return
  var id = parseInt(btn.getAttribute('data-id'), 10)
  var i
  for (i = 0; i < buttons.length; i++) {
    if (buttons[i].id === id) {
      setSwitch(buttons[i])
      return
    }
  }
}

if (el('deck').addEventListener) {
  el('deck').addEventListener('mousedown', onSlideStart, false)
  el('deck').addEventListener('touchstart', onSlideStart, false)
  document.addEventListener('mousemove', onSlideMove, false)
  document.addEventListener('touchmove', onSlideMove, false)
  document.addEventListener('mouseup', onSlideEnd, false)
  document.addEventListener('touchend', onSlideEnd, false)
  document.addEventListener('touchcancel', onSlideEnd, false)
}

checkLogin(function () {
  loadStatus(function () {})
  if (authRequired && !isAuthorized()) startDeviceRequest()
})

setInterval(function () {
  loadStatus(function () {})
}, 1000)

if (window.addEventListener) {
  window.addEventListener('resize', function () {
    layoutKeys()
    fitLabels()
  })
}
