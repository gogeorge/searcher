# ctrlFACK — Advanced Find

An advanced in-page text search injected as a content script.

- **Open / close:** `Ctrl + Shift + F` (`Cmd + Shift + F` on macOS). Close with the
  same shortcut, `Esc`, or the **✕** button on the search box. (`Ctrl + Z` no longer
  opens it — it collided with Undo.) The shortcut is handled inside the content
  script, so there's no background page to go idle.
- **Navigate matches:** `Enter` = next, `Shift + Enter` = previous, or the `‹ ›`
  buttons. A live `n / total` counter shows your position; the current match is
  highlighted in amber, the rest in green.

Matches are highlighted **directly on the live page** (via DOM range wrapping),
so the page stays interactive and dynamic content works — no blurred overlay.

Features: plain find (with autocomplete), word distance, regex (highlights the
actual matches), word size, and find-email.

## Loading the extension

This is a single **Manifest V3** build that works in both browsers. It uses a
tiny background script only to receive the keyboard shortcut; the same folder
loads everywhere.

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
