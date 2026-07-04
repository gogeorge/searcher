# ctrlFACK — Advanced Find

An advanced in-page text search injected as a content script. Open it on any
page with **Ctrl + Z**, then press it again to close.

Features: plain find (with autocomplete + occurrence previews), word distance,
regex, word size, and find-email. Matches are highlighted and shown in a
frosted results overlay.

## Loading the extension

This is a single **Manifest V3** build that works in both browsers. The code
uses no `chrome.*` / `browser.*` APIs, so the same folder loads everywhere.

### Chrome / Edge / Brave
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. **Load unpacked** → select this `extension/` folder

### Firefox (109+)
1. Go to `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…**
3. Select the `manifest.json` inside this `extension/` folder

> Temporary add-ons are removed when Firefox restarts. For a permanent install
> the add-on must be signed via [addons.mozilla.org](https://addons.mozilla.org).
> The `browser_specific_settings.gecko.id` in the manifest is already set for that.

## UI theme

The interface uses a GPU-conscious "liquid glass" style: `backdrop-filter`
blur is applied only to the few panels/inputs (never to the inline highlights,
and never animated), with borders + inset highlights faking the glass edge
instead of expensive SVG refraction filters. Tune it via the `--cf-*` variables
at the top of `main.css`.
