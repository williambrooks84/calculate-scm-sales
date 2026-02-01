# calculate-scm-sales

Steam Community Market userscript to show sale values in keys.

## Install (one-click)

- Userscript (show price in keys): https://raw.githubusercontent.com/williambrooks84/calculate-scm-sales/main/calculate-scm-sales.user.js

## Quick install (Tampermonkey / Greasemonkey)

1. Install Tampermonkey (Chrome or Opera GX): https://www.tampermonkey.net/
2. Install Greasemonkey (Firefox): https://addons.mozilla.org/firefox/addon/greasemonkey/
3. Open the raw userscript URL above in your browser — Tampermonkey/Greasemonkey will prompt to install.

## Included scripts

- `calculate-scm-sales.user.js` — Shows key median and value-in-keys on Steam Market price history above the defauly overlay.

## Usage

- Open a Steam Market listing or search page.
- Hover points in the price history chart to see the key median and value-in-keys. The script uses the Steam key median history to compute values.

## Auto-update for users

The scripts include `@updateURL` / `@downloadURL` referencing the raw GitHub files so Tampermonkey can auto-update when you bump `@version` and push changes.

## Demonstration of the script in use
<p align="center">
  <img src="screenshots/in-use.png" alt="In use screenshot" width="700">
</p>

---
Written and maintained by williambrooks84.