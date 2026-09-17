/* Zeus / Navico MFD: ES5, XHR, no fetch/async/await. */
var PLUGIN = 'signalk-control-panel-plugin'
var API_READ = '/signalk/v1/api/' + PLUGIN
var API_WRITE = '/plugins/' + PLUGIN
var TOKEN_KEY = 'skDeviceToken'
var CLIENT_KEY = 'skDeviceClientId'
var HREF_KEY = 'skDeviceHref'

var authToken = ''
var loggedIn = false
var authRequired = true
var buttons = []
var putting = null
var devicePending = false
var pollTimer = null

try { authToken = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem('skAuthToken') || '' } catch (e) {}

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

function getClientId () {
  var id = storageGet(CLIENT_KEY)
  if (!id) {
    id = uuid()
    storageSet(CLIENT_KEY, id)
  }
  return id
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
  xhr.withCredentials = true
  if (opts.body) xhr.setRequestHeader('Content-Type', 'application/json')
  if (authToken) xhr.setRequestHeader('Authorization', 'Bearer ' + authToken)
  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return
    var data = {}
    try { data = xhr.responseText ? JSON.parse(xhr.responseText) : {} } catch (err) {
      data = { error: xhr.responseText }
    }
    cb(xhr.status, data)
  }
  xhr.send(opts.body ? JSON.stringify(opts.body) : null)
}

function setStatus (msg, isError) {
  var line = el('statusLine')
  line.textContent = msg || ''
  if (isError) line.className = 'meta error'
  else line.className = 'meta'
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
    loggedIn = false
    saveToken('')
    renderLogin()
    startDeviceRequest()
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

function applyLogin (token) {
  if (token) saveToken(token)
  loggedIn = true
  devicePending = false
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  storageDel(HREF_KEY)
  renderLogin()
}

function pollDeviceHref (href) {
  http({ method: 'GET', url: href, json: false }, function (status, data) {
    if (status === 404) {
      storageDel(HREF_KEY)
      submitDeviceRequest()
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
      setStatus('Device access was denied', true)
      renderLogin()
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    }
  })
}

function submitDeviceRequest () {
  var body = {
    clientId: getClientId(),
    description: 'Control Panel (' + (window.location.hostname || 'webapp') + ')',
    permissions: 'readwrite'
  }
  http({ method: 'POST', url: '/signalk/v1/access/requests', body: body }, function (status, data) {
    if (data && data.token) {
      applyLogin(data.token)
      loadStatus(function () {})
      return
    }
    if (data && data.href) {
      storageSet(HREF_KEY, data.href)
      devicePending = true
      renderLogin()
      setStatus('Approve this device in Signal K → Security → Access Requests')
      if (!pollTimer) pollTimer = setInterval(function () { pollDeviceHref(data.href) }, 3000)
      pollDeviceHref(data.href)
      return
    }
    var href = storageGet(HREF_KEY)
    if (href) {
      devicePending = true
      renderLogin()
      setStatus('Approve this device in Signal K → Security → Access Requests')
      if (!pollTimer) pollTimer = setInterval(function () { pollDeviceHref(href) }, 3000)
      return
    }
    if (status === 404) {
      renderLogin()
      return
    }
    devicePending = true
    renderLogin()
    setStatus('Waiting for device approval in Signal K', false)
  })
}

function startDeviceRequest () {
  if (!authRequired || loggedIn) return
  var href = storageGet(HREF_KEY)
  if (href) {
    devicePending = true
    renderLogin()
    setStatus('Approve this device in Signal K → Security → Access Requests')
    if (!pollTimer) pollTimer = setInterval(function () { pollDeviceHref(href) }, 3000)
    pollDeviceHref(href)
    return
  }
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
    renderLogin()
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

function renderDeck () {
  var deck = el('deck')
  if (!buttons.length) {
    deck.innerHTML = '<p class="empty">No buttons configured. Add switch or monitor buttons in plugin config.</p>'
    return
  }
  var html = []
  var i
  for (i = 0; i < buttons.length; i++) {
    var button = buttons[i]
    var on = button.on ? ' on' : ' off'
    var busy = putting === button.id ? ' disabled' : ''
    var role = button.mode === 'monitor' ? 'monitor' : 'switch'
    html.push(
      '<button type="button" class="key ' + role + on + '" data-id="' + button.id + '" data-mode="' + role + '"' + busy + '>' +
        '<span class="label">' + escapeHtml(button.label) + '</span>' +
      '</button>'
    )
  }
  deck.innerHTML = html.join('')
  layoutKeys()
  fitLabels()
}

function isPhoneWidth () {
  var w = window.innerWidth || document.documentElement.clientWidth || 1024
  return w < 768
}

function layoutKeys () {
  var deck = el('deck')
  var keys = deck.getElementsByClassName('key')
  var i, lab, size, cols, gap, deckW, phone
  if (!keys.length) return
  deckW = deck.clientWidth
  phone = isPhoneWidth()
  cols = 2
  if (deckW >= 540) cols = 3
  gap = 10
  size = Math.floor((deckW - gap * cols) / cols)
  if (size < 96) size = 96
  for (i = 0; i < keys.length; i++) {
    if (!phone) {
      keys[i].style.width = ''
      keys[i].style.height = ''
      keys[i].style.margin = ''
      lab = keys[i].getElementsByClassName('label')[0]
      if (lab) {
        lab.style.width = ''
        lab.style.height = ''
        lab.style.maxWidth = ''
      }
    } else {
      keys[i].style.width = size + 'px'
      keys[i].style.height = size + 'px'
      keys[i].style.margin = Math.floor(gap / 2) + 'px'
      lab = keys[i].getElementsByClassName('label')[0]
      if (lab) {
        lab.style.width = size + 'px'
        lab.style.height = size + 'px'
        lab.style.maxWidth = size + 'px'
      }
    }
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
    inner = key.clientWidth - 20
    words = (lab.textContent || '').replace(/^\s+|\s+$/g, '').split(/\s+/)
    size = 1.55
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
  getJson(API_READ + '/status', function (err, data) {
    if (err) {
      setStatus(err.message, true)
      if (cb) cb(err)
      return
    }
    buttons = data.buttons || []
    if (!data.started) setStatus('Plugin not started', true)
    else if (!devicePending) setStatus('')
    renderDeck()
    if (cb) cb(null)
  })
}

function applyToggleResult (err, data) {
  putting = null
  if (err) setStatus(err.message, true)
  else {
    buttons = (data && data.buttons) || buttons
    setStatus('')
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

checkLogin(function () {
  loadStatus(function () {})
  if (authRequired && !loggedIn) startDeviceRequest()
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
