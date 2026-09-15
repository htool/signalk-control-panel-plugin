# signalk-control-panel-plugin

Stream Deck-style [Signal K](https://signalk.org) webapp for boolean-ish **switches** and **monitors**.

Mobile first. Light and dark follow the phone display mode (`prefers-color-scheme`). Face is Handset Condensed.

## In

- Plugin config: a list of buttons
  - **Mode:** Switch (toggle) or Monitor (view)
  - **Label**
  - **Path** (under `vessels.self`)
- Switch keys: green when `on` / `1` / `true` / `online`, transparent when `off` / `0` / `false` / `offline`
- Monitor keys: green when on, red when off
- Tapping a switch PUTs the opposite value, keeping the current type (`1`/`0`, `true`/`false`, `on`/`off`, `online`/`offline`)

## Out

- NMEA 2000 encoding
- Layout editors
- Non-boolean gauges

## Webapp

Webapps → **Control Panel**. Reads go through `/signalk/v1/api/signalk-control-panel-plugin/status`. Toggles use `PUT /plugins/signalk-control-panel-plugin/buttons/:id` and need a Signal K session.

## Auto-publish

GitHub Action `.github/workflows/release.yml` patch-bumps and publishes to npm at most once per UTC day when `plugin/`, `lib/`, or `public/` changed. Trusted Publisher (OIDC), workflow filename **must stay** `release.yml`.

The first npm version cannot use OIDC. Publish `0.0.1` once from a logged-in machine, then add the trusted publisher for `htool/signalk-control-panel-plugin` / `release.yml`.
