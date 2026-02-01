// ==UserScript==
// @name         Steam Market – Show Price in Keys
// @namespace    https://github.com/williambrooks84/calculate-scm-sales
// @version      1.0.1
// @description  Adds key median and price-in-keys to Steam Market price history tooltips
// @match        https://steamcommunity.com/market/listings/*
// @grant        GM_xmlhttpRequest
// @connect      steamcommunity.com
// @updateURL    https://raw.githubusercontent.com/williambrooks84/calculate-scm-sales/main/calculate-scm-sales.user.js
// @downloadURL  https://raw.githubusercontent.com/williambrooks84/calculate-scm-sales/main/calculate-scm-sales.user.js
// ==/UserScript==

(function () {
    'use strict';

    /*****************************************************************
     * CONFIG
     *****************************************************************/
    const KEY_PRICE_URL =
        "https://steamcommunity.com/market/pricehistory/?" +
        "appid=440&market_hash_name=Mann%20Co.%20Supply%20Crate%20Key";

    /*****************************************************************
     * STATE
     *****************************************************************/
    let keyHistory = null;

    /*****************************************************************
     * UTILITIES
     *****************************************************************/

    function normalizeDay(dateStr) {
        return new Date(dateStr).toISOString().slice(0, 10);
    }

    function parsePrice(text) {
        // handles €, $, commas, etc
        const n = text.replace(/[^\d.,]/g, "").replace(",", ".");
        return parseFloat(n);
    }

    function getKeyMedianForDay(dateStr) {
        if (!keyHistory) return null;

        const day = normalizeDay(dateStr);

        const matches = keyHistory.filter(k =>
            normalizeDay(k[0]) === day
        );

        if (!matches.length) return null;

        // Steam already gives medians, but there may be multiple buckets/day
        const prices = matches.map(k => k[1]).sort((a, b) => a - b);
        return prices[Math.floor(prices.length / 2)];
    }

    /*****************************************************************
     * FETCH KEY PRICE HISTORY
     *****************************************************************/

    function fetchKeyHistory() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: KEY_PRICE_URL,
                onload: (res) => {
                    try {
                        const json = JSON.parse(res.responseText);
                        keyHistory = json.prices || [];
                        console.log("[Key Normalizer] Key history loaded:", keyHistory.length);
                        resolve();
                    } catch (e) {
                        console.error("[Key Normalizer] Failed to parse key history", e);
                    }
                }
            });
        });
    }

    /*****************************************************************
     * TOOLTIP ENHANCEMENT
     *****************************************************************/

    function enhanceTooltip(tooltip) {
        if (tooltip.dataset.keyEnhanced) return;

        const lines = tooltip.innerText.split("\n");
        if (lines.length < 2) return;

        const dateText = lines[0];
        const priceText = lines[1];

        const itemPrice = parsePrice(priceText);
        if (!itemPrice) return;

        const keyMedian = getKeyMedianForDay(dateText);
        if (!keyMedian) return;

        const valueInKeys = itemPrice / keyMedian;

        const extra = document.createElement("div");
        extra.style.marginTop = "6px";
        extra.style.paddingTop = "6px";
        extra.style.borderTop = "1px solid #3a4b5c";
        extra.style.color = "#c7d5e0";

        extra.innerHTML = `
            <div>Key median: ${keyMedian.toFixed(2)}</div>
            <div><b>Value:</b> ${valueInKeys.toFixed(2)} keys</div>
        `;

        tooltip.appendChild(extra);
        tooltip.dataset.keyEnhanced = "true";
    }

    /*****************************************************************
     * OBSERVE TOOLTIP CREATION
     *****************************************************************/

    function observeTooltips() {
        const observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (
                        node.nodeType === 1 &&
                        node.classList.contains("hover_tooltip")
                    ) {
                        enhanceTooltip(node);
                    }
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /*****************************************************************
     * INIT
     *****************************************************************/

    (async function init() {
        await fetchKeyHistory();
        observeTooltips();
        console.log("[Key Normalizer] Initialized");
    })();

    setInterval(() => {
    document.querySelectorAll(".hover_tooltip, .market_tooltip")
        .forEach(enhanceTooltip);
}, 300);

})();
