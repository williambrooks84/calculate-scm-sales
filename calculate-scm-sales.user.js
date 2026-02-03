// ==UserScript==
// @name         Steam Market – Show Sale Price in Keys
// @namespace    https://github.com/williambrooks84/calculate-scm-sales
// @version      1.0.3
// @description  Steam Community Market userscript to show sale values in keys.
// @author       William Brooks (Strange Fry on Steam)
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
    let keyMedianByDay = null;

    /*****************************************************************
     * UTILITIES
     *****************************************************************/

    function parseKeyHistoryDate(dateStr) {
        if (dateStr instanceof Date) return dateStr;
        if (typeof dateStr === "number") return new Date(dateStr);
        if (typeof dateStr !== "string") return new Date(NaN);

        // Example: "Jan 30 2026 00: +0" -> "Jan 30 2026 00: UTC"
        const cleaned = dateStr.replace(/\s\+0$/, " UTC");
        return new Date(cleaned);
    }

    function normalizeDay(dateStr) {
        const d = parseKeyHistoryDate(dateStr);
        if (Number.isNaN(d.getTime())) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function parsePrice(text) {
        const n = text.replace(/[^\d.,]/g, "").replace(",", ".");
        return parseFloat(n);
    }

    function buildMedianByDay() {
        const byDay = new Map();

        for (const row of keyHistory || []) {
            const day = normalizeDay(row[0]);
            if (!day) continue;

            const price = Number(row[1]);
            if (!Number.isFinite(price)) continue;

            if (!byDay.has(day)) byDay.set(day, []);
            byDay.get(day).push(price);
        }

        const medianMap = new Map();
        for (const [day, prices] of byDay.entries()) {
            prices.sort((a, b) => a - b);
            medianMap.set(day, prices[Math.floor(prices.length / 2)]);
        }

        return medianMap;
    }

    function getKeyMedianForDay(dateStr) {
        if (!keyMedianByDay) return null;
        const day = normalizeDay(dateStr);
        if (!day) return null;
        return keyMedianByDay.get(day) ?? null;
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
                        keyMedianByDay = buildMedianByDay();
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
     * INIT
     *****************************************************************/

    let overlayHover = false;

    function ensureOverlay() {
        let overlay = document.getElementById("key-normalizer-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "key-normalizer-overlay";
            overlay.style.position = "fixed";
            overlay.style.zIndex = "99999";
            overlay.style.display = "none";
            overlay.style.background = "rgba(0,0,0,0.85)";
            overlay.style.border = "1px solid #3a4b5c";
            overlay.style.borderRadius = "4px";
            overlay.style.color = "#c7d5e0";
            overlay.style.padding = "6px 8px";
            overlay.style.fontSize = "12px";
            overlay.style.lineHeight = "1.2";
            overlay.style.pointerEvents = "auto";
            overlay.style.userSelect = "text";
            overlay.style.cursor = "text";
            overlay.style.maxWidth = "240px";
            overlay.style.whiteSpace = "normal";

            overlay.addEventListener("mouseenter", () => {
                overlayHover = true;
                overlay.style.display = "block";
            });
            overlay.addEventListener("mouseleave", () => {
                overlayHover = false;
            });

            document.body.appendChild(overlay);
        }
        return overlay;
    }

    function updateOverlayFromTooltip(tooltip) {
        const html = tooltip.innerHTML || "";
        const dateMatch = html.match(/([A-Z][a-z]{2}\s+\d{1,2}\s+\d{4})/);
        const priceMatch = html.match(/([0-9]+(?:[.,][0-9]+)?)\s*([€$£])/);
        if (!dateMatch || !priceMatch) return;

        const dateLine = dateMatch[1];
        const itemPrice = parsePrice(priceMatch[0]);
        if (!itemPrice) return;

        const keyMedian = getKeyMedianForDay(dateLine);
        if (!keyMedian) return;

        const valueInKeys = itemPrice / keyMedian;

        const overlay = ensureOverlay();
        overlay.innerHTML = `
            <p><b>${dateLine}</b></p>
            <p><b>Key median:</b> ${keyMedian.toFixed(2)}</p>
            <p> <b>Value:</b> ${itemPrice.toFixed(2)} / ${keyMedian.toFixed(2)} =</p>
            <p> ${valueInKeys.toFixed(2)} keys</p>
        `;

        overlay.style.display = "block";
        overlay.style.visibility = "hidden";

        const rect = tooltip.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();

        let left = rect.left + (rect.width / 2) - (overlayRect.width / 2);
        let top = rect.top - overlayRect.height - 8;

        left = Math.max(8, Math.min(left, window.innerWidth - overlayRect.width - 8));

        if (top < 8) {
            top = rect.bottom + 8;
            if (top + overlayRect.height > window.innerHeight - 8) {
                top = window.innerHeight - overlayRect.height - 8;
            }
        }

        overlay.style.left = `${left}px`;
        overlay.style.top = `${top}px`;
        overlay.style.visibility = "visible";
    }

    function pollJqplotTooltip() {
        const tooltip =
            document.querySelector(".jqplot-highlighter-tooltip") ||
            document.querySelector(".jqplot-cursor-tooltip");
        if (!tooltip) return;

        const visible = getComputedStyle(tooltip).display !== "none";
        const overlay = ensureOverlay();

        if (!visible && !overlayHover) {
            overlay.style.display = "none";
            return;
        }

        if (visible) {
            updateOverlayFromTooltip(tooltip);
        }
    }

    (async function init() {
        await fetchKeyHistory();
        setInterval(pollJqplotTooltip, 150);

        //console.log("[Key Normalizer] Initialized");
    })();

})();
