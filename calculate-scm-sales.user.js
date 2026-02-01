// ==UserScript==
// @name         Steam Market – Show Sale Price in Keys
// @namespace    https://github.com/williambrooks84/calculate-scm-sales
// @version      1.0.2
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

    const TOOLTIP_SELECTORS =
        ".hover_tooltip, .market_tooltip, .jqplot-highlighter-tooltip, .jqplot-cursor-tooltip";

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
        // handles €, $, commas, etc
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
     * TOOLTIP ENHANCEMENT (fallback for standard tooltips)
     *****************************************************************/

    function enhanceTooltip(tooltip) {
        if (tooltip.dataset.keyEnhanced) return;

        const lines = tooltip.innerText.split("\n").map(s => s.trim()).filter(Boolean);
        if (!lines.length) return;

        const dateLine = lines.find(l => normalizeDay(l));
        if (!dateLine) return;

        const priceLine = lines.find(l => /[\d.,]/.test(l) && /[$€£¥]|USD|EUR|GBP/i.test(l));
        if (!priceLine) return;

        const itemPrice = parsePrice(priceLine);
        if (!itemPrice) return;

        const keyMedian = getKeyMedianForDay(dateLine);
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
     * jqPlot Highlighter Hook (primary for Steam chart)
     *****************************************************************/

    const observedTooltips = new WeakSet();

    function attachTooltipObserver(tooltip) {
        if (!tooltip || observedTooltips.has(tooltip)) return;
        observedTooltips.add(tooltip);

        const observer = new MutationObserver(() => updateTooltipElement(tooltip));
        observer.observe(tooltip, { childList: true, subtree: true, characterData: true });

        // Run once immediately in case tooltip already has text
        updateTooltipElement(tooltip);
    }

    function scanTooltips() {
        document
            .querySelectorAll(".jqplot-highlighter-tooltip, .jqplot-cursor-tooltip")
            .forEach(attachTooltipObserver);
    }

    function updateTooltipElement(tooltip) {
        if (!tooltip) return;

        const html = tooltip.innerHTML || "";

        const dateMatch = html.match(/([A-Z][a-z]{2}\s+\d{1,2}\s+\d{4})/);
        const priceMatch = html.match(/([0-9]+(?:[.,][0-9]+)?)\s*([€$£])/);

        if (!dateMatch || !priceMatch) {
            return;
        }

        const dateLine = dateMatch[1];
        const priceLine = priceMatch[0];

        const itemPrice = parsePrice(priceLine);
        if (!itemPrice) return;

        const keyMedian = getKeyMedianForDay(dateLine);
        if (!keyMedian) return;

        const valueInKeys = itemPrice / keyMedian;
        const key = `${dateLine}|${itemPrice.toFixed(4)}`;
        if (tooltip.dataset.keyEnhanced === key) return;

        // Remove previous injected block
        const cleanedHtml = html.replace(/<div class="key-normalizer-extra">[\s\S]*?<\/div>/, "");

        // Append our block
        const extraHtml = `
            <div class="key-normalizer-extra" style="margin-top:6px;padding-top:6px;border-top:1px solid #3a4b5c;color:#c7d5e0;">
                <div>Key median: ${keyMedian.toFixed(2)}</div>
                <div><b>Value:</b> ${valueInKeys.toFixed(2)} keys</div>
            </div>
        `;

        tooltip.innerHTML = cleanedHtml + extraHtml;

        // Ensure it can grow to show extra lines
        tooltip.style.whiteSpace = "normal";
        tooltip.style.height = "auto";

        tooltip.dataset.keyEnhanced = key;
    }

    /*****************************************************************
     * OBSERVE TOOLTIP CREATION
     *****************************************************************/

    function observeTooltips() {
        const observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === 1 && node.matches && node.matches(TOOLTIP_SELECTORS)) {
                        enhanceTooltip(node);
                    }
                    if (node.nodeType === 1 && node.matches &&
                        node.matches(".jqplot-highlighter-tooltip, .jqplot-cursor-tooltip")) {
                        attachTooltipObserver(node);
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

        // Measure overlay size
        overlay.style.display = "block";
        overlay.style.visibility = "hidden";

        const rect = tooltip.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();

        // Default: above tooltip
        let left = rect.left + (rect.width / 2) - (overlayRect.width / 2);
        let top = rect.top - overlayRect.height - 8;

        // Clamp horizontally
        left = Math.max(8, Math.min(left, window.innerWidth - overlayRect.width - 8));

        // If not enough space above, place below
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
        observeTooltips();
        scanTooltips();

        setInterval(pollJqplotTooltip, 150);

        //console.log("[Key Normalizer] Initialized");
    })();

    setInterval(() => {
        document.querySelectorAll(TOOLTIP_SELECTORS)
            .forEach(enhanceTooltip);
    }, 300);

})();
