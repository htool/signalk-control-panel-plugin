const PLUGIN = 'signalk-control-panel-plugin'
const API_READ = '/signalk/v1/api/' + PLUGIN
const API_WRITE = '/plugins/' + PLUGIN

let authToken = sessionStorage.getItem('skAuthToken') || ''
let loggedIn = false
let authRequired = true
let loginUser = ''
let buttons = []
let putting = null
let askedBrowser = false

function el (id) { return document.getElementById(id) }

function authHeaders (extra) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {})
  if (authToken) headers.Authorization = 'Bearer ' + authToken
  return headers
}

function setStatus (msg, isError) {
  const line = el('statusLine')
  line.textContent = msg || ''
  line.classList.toggle('error', !!isError)
}

function httpError (res, data, url) {
  if (res.status === 401) {
    loggedIn = false
    authToken = ''
    sessionStorage.removeItem('skAuthToken')
    renderLogin()
    askBrowserLogin()
    return new Error('Log in to Signal K to toggle switches')
  }
  return new Error((data && (data.error || data.message)) || res.status + ' ' + url)
}

async function getJson (url) {
  const res = await fetch(url, { credentials: 'include', headers: authHeaders() })
  const text = await res.text()
  let data = {}
  try { data = text ? JSON.parse(text) : {} } catch (_) { data = { error: text } }
  if (!res.ok) throw httpError(res, data, url)
  return data
}

async function sendJson (url, method, body) {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: authHeaders(),
    body: JSON.stringify(body || {})
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw httpError(res, data, url)
  return data
}

function renderLogin () {
  const form = el('loginForm')
  const who = el('loginWho')
  const need = authRequired && !loggedIn
  form.hidden = !need
  who.hidden = !loggedIn
  if (loggedIn) who.textContent = loginUser ? 'Signed in as ' + loginUser : 'Signed in'
}

async function storeBrowserCredentials (username, password) {
  if (!username || !password || !window.PasswordCredential || !navigator.credentials) return
  try {
    await navigator.credentials.store(new PasswordCredential({
      id: username,
      password: password,
      name: username
    }))
  } catch (_) {}
}

async function promptBrowserCredentials () {
  if (!navigator.credentials || typeof navigator.credentials.get !== 'function') return null
  try {
    const cred = await navigator.credentials.get({
      password: true,
      mediation: 'required'
    })
    if (cred && cred.password) {
      return { username: cred.id, password: cred.password }
    }
  } catch (_) {}
  return null
}

async function loginWith (username, password) {
  const res = await fetch('/signalk/v1/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || 'Login failed')
  if (data.token) {
    authToken = data.token
    sessionStorage.setItem('skAuthToken', authToken)
  }
  loggedIn = true
  loginUser = username
  await storeBrowserCredentials(username, password)
  renderLogin()
  await loadStatus()
}

async function askBrowserLogin () {
  if (askedBrowser || loggedIn || !authRequired) return
  askedBrowser = true
  const cred = await promptBrowserCredentials()
  if (!cred) {
    renderLogin()
    return
  }
  try {
    await loginWith(cred.username, cred.password)
  } catch (err) {
    askedBrowser = false
    setStatus(err.message, true)
    renderLogin()
  }
}

async function checkLogin () {
  try {
    const res = await fetch('/skServer/loginStatus', {
      credentials: 'include',
      headers: authHeaders()
    })
    const data = await res.json().catch(() => ({}))
    authRequired = data.authenticationRequired !== false
    loggedIn = data.status === 'loggedIn'
    loginUser = data.username || ''
  } catch (_) {
    authRequired = true
    loggedIn = false
  }
  renderLogin()
}

function escapeHtml (s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderDeck () {
  const deck = el('deck')
  if (!buttons.length) {
    deck.innerHTML = '<p class="empty">No buttons configured. Add switch or monitor buttons in plugin config.</p>'
    return
  }
  deck.innerHTML = buttons.map((button) => {
    const on = button.on ? ' on' : ' off'
    const busy = putting === button.id ? ' disabled' : ''
    const role = button.mode === 'monitor' ? 'monitor' : 'switch'
    return (
      '<button type="button" class="key ' + role + on + '" data-id="' + button.id + '" data-mode="' + role + '"' + busy + '>' +
        '<span class="label">' + escapeHtml(button.label) + '</span>' +
      '</button>'
    )
  }).join('')
}

async function loadStatus () {
  const data = await getJson(API_READ + '/status')
  buttons = data.buttons || []
  if (!data.started) setStatus('Plugin not started', true)
  else setStatus('')
  renderDeck()
}

async function setSwitch (button) {
  if (button.mode !== 'switch' || putting != null) return
  putting = button.id
  renderDeck()
  try {
    const data = await sendJson(API_WRITE + '/buttons/' + button.id, 'PUT', { value: 'toggle' })
    buttons = data.buttons || buttons
    setStatus('')
    renderDeck()
  } catch (err) {
    setStatus(err.message, true)
  } finally {
    putting = null
    renderDeck()
  }
}

el('deck').onclick = (ev) => {
  const btn = ev.target.closest('button.key')
  if (!btn || btn.getAttribute('data-mode') !== 'switch') return
  const id = parseInt(btn.getAttribute('data-id'), 10)
  const button = buttons.find((b) => b.id === id)
  if (button) setSwitch(button)
}

el('loginForm').onsubmit = async (ev) => {
  ev.preventDefault()
  const errEl = el('loginErr')
  errEl.textContent = ''
  const username = el('loginUser').value
  const password = el('loginPass').value
  try {
    await loginWith(username, password)
  } catch (err) {
    errEl.textContent = err.message
  }
}

checkLogin()
  .then(async () => {
    await loadStatus().catch((err) => setStatus(err.message, true))
    if (authRequired && !loggedIn) await askBrowserLogin()
  })
  .catch((err) => setStatus(err.message, true))

setInterval(() => {
  loadStatus().catch(() => {})
}, 1000)
