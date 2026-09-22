# signalk-control-panel-plugin

Stream Deck-style [Signal K](https://signalk.org) webapp for boolean-ish **switches** and **monitors**.

Mobile first. Light and dark follow the phone display mode (`prefers-color-scheme`). Face is Handset Condensed.

## In

- Plugin config: a list of buttons
  - **Mode:** Switch (toggle) or Monitor (view)
  - **Label**
  - **Path** (under `vessels.self`)
  - **Slide to activate:** optional. On a phone the key is a full-width **red** slider; slide left to right to toggle (avoids accidental taps)
- Switch keys: frosted milk glass, green when `on` / `1` / `true` / `online`, clear when `off` / `0` / `false` / `offline`
- Monitor keys: green when on, red when off
- Tapping a switch PUTs the opposite value on the live Signal K path, keeping the current type (`1`/`0`, `true`/`false`, `on`/`off`, `online`/`offline`)
- If the path does not exist yet, the plugin creates it for this run (nothing is stored in plugin-data)

## Out

- NMEA 2000 encoding
- Layout editors
- Non-boolean gauges

## Webapp

Webapps → **Control Panel**. Reads go through `GET /signalk/v1/api/signalk-control-panel-plugin/status` (Signal K 2.x readonly, Zeus-safe). Toggles prefer `PUT /plugins/signalk-control-panel-plugin/buttons/:id` with a session or device token, and fall back to `GET /signalk/v1/api/signalk-control-panel-plugin/buttons/:id/toggle`.

The page is ES5 + `XMLHttpRequest` so Navico Zeus can run it as an MFD tile. On first open it `POST`s `/signalk/v1/access/requests` (`permissions: readwrite`). Approve **Control Panel** under Signal K → Security → Access Requests; the JWT is kept in `localStorage` and sent as `Authorization: Bearer`. There is no username/password form.

Add the tile in `signalk-mfd-plugin` with its own extra IP (boatnet placeholder `192.168.3.10`):

- URL: `http://192.168.3.10:3000/signalk-control-panel-plugin/?v=20260922row`
- Icon: `http://192.168.3.10:3000/signalk-control-panel-plugin/icon.png`

Reopen the Zeus tile after HTML cache-bust changes.

## Auto-publish

GitHub Action `.github/workflows/release.yml` patch-bumps and publishes to npm at most once per UTC day when `plugin/`, `lib/`, or `public/` changed. Trusted Publisher (OIDC), workflow filename **must stay** `release.yml`. npm **0.0.1** is already on the registry.
