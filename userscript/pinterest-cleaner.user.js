// ==UserScript==
// @name         Pinterest Cleaner
// @namespace    pinterest-cleaner
// @version      2.0.0
// @description  Entfernt Werbung und Promo-Pins auf Pinterest, bevor sie gerendert werden – die echten Pins rücken lückenlos zusammen.
// @match        *://*.pinterest.com/*
// @match        *://*.pinterest.de/*
// @match        *://*.pinterest.at/*
// @match        *://*.pinterest.ch/*
// @match        *://*.pinterest.co.uk/*
// @match        *://*.pinterest.fr/*
// @match        *://*.pinterest.es/*
// @match        *://*.pinterest.it/*
// @match        *://*.pinterest.nl/*
// @match        *://*.pinterest.se/*
// @match        *://*.pinterest.dk/*
// @match        *://*.pinterest.pt/*
// @match        *://*.pinterest.ie/*
// @match        *://*.pinterest.ca/*
// @match        *://*.pinterest.com.au/*
// @match        *://*.pinterest.nz/*
// @match        *://*.pinterest.com.mx/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

// Automatisch erzeugt aus content/cleaner.js. Code-Änderungen bitte dort machen.
// Hier nur die Einstellungen (DEFAULTS, ein paar Zeilen weiter unten) anpassen.

/* ---------------------------------------------------------------
   Pinterest Cleaner – Hauptlogik (läuft im Seitenkontext)

   Ebene 1 – Datenfilter: Werbe-Pins werden aus den API-Antworten
   (XHR, fetch, JSON.parse) entfernt, bevor Pinterest sie rendert.
   Pinterests eigenes Masonry-Layout ordnet die übrigen Pins dann
   lückenlos an – es entsteht gar keine Lücke.

   Ebene 2 – DOM-Fallback: Was trotzdem durchrutscht, wird am
   Grid-Item erkannt, ausgeblendet und die Pins darunter in der
   gleichen Spalte werden um die Lücke nach oben geschoben.

   Dieselbe Datei wird auch als iPhone-Userscript ausgeliefert
   (siehe tools/build-userscript.sh). Dort gelten die DEFAULTS.
   --------------------------------------------------------------- */
(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    hideAds: true,
    hideModules: true,
    hideSearchSuggestions: true,
    hideVideoPins: false,
    hideShoppablePins: false,
    keywordsEnabled: true,
    keywords: ""
  };

  if (window.__pclLoaded) return;
  window.__pclLoaded = true;

  const STORAGE_KEY = "pcl:settings";
  const origParse = JSON.parse;
  const origStringify = JSON.stringify;

  let settings = { ...DEFAULTS };
  let keywords = [];
  let removed = 0;

  function parseKeywords(raw) {
    return String(raw || "")
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) settings = { ...DEFAULTS, ...origParse(raw) };
  } catch (_) {
    /* Kein localStorage (privates Fenster) – Defaults bleiben. */
  }
  keywords = parseKeywords(settings.keywords);

  function bump(n) {
    removed += n;
    const root = document.documentElement;
    if (root) root.dataset.pclRemoved = String(removed);
  }

  /* ===============================================================
     Ebene 1: Datenfilter
     =============================================================== */

  const PIN_MARKER = /"type":\s*"pin"|"__typename":\s*"Pin"/;

  function isPin(o) {
    return o.type === "pin" || o.__typename === "Pin";
  }

  function isAdData(o) {
    return (
      o.is_promoted === true ||
      o.isPromoted === true ||
      o.is_downstream_promotion === true ||
      o.isDownstreamPromotion === true ||
      o.promoted_is_removable === true ||
      o.promotedIsRemovable === true ||
      o.is_third_party_ad === true ||
      o.isThirdPartyAd === true ||
      !!o.promoter ||
      !!o.ad_destination_url ||
      !!o.adDestinationUrl ||
      !!o.campaign_id ||
      !!o.campaignId
    );
  }

  function isVideoData(o) {
    if (o.is_video === true || o.isVideo === true) return true;
    if (o.videos && typeof o.videos === "object" && Object.keys(o.videos).length) return true;
    const story = o.story_pin_data || o.storyPinData;
    if (story && typeof story === "object") {
      try {
        return /"video_list"|"videoList"/.test(origStringify(story));
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  const nonEmpty = (a) => Array.isArray(a) && a.length > 0;

  function isShopData(o) {
    const rich = o.rich_summary || o.richSummary || o.rich_metadata || o.richMetadata;
    return (
      o.is_shoppable === true ||
      o.isShoppable === true ||
      nonEmpty(o.shopping_flags) ||
      nonEmpty(o.shoppingFlags) ||
      (rich && typeof rich === "object" && nonEmpty(rich.products)) ||
      Number(o.price_value) > 0 ||
      !!o.product_pin_data ||
      !!o.productPinData ||
      !!o.buyable_product_availability
    );
  }

  const TEXT_FIELDS = [
    "grid_title", "gridTitle", "title", "description",
    "closeup_unified_description", "closeupUnifiedDescription",
    "auto_alt_text", "autoAltText", "seo_alt_text", "link", "domain"
  ];

  function matchesKeywordData(o) {
    let hay = "";
    for (const f of TEXT_FIELDS) if (typeof o[f] === "string") hay += " " + o[f];
    hay = hay.toLowerCase();
    return keywords.some((w) => hay.includes(w));
  }

  /* Zuletzt durchgelassene Pins – für die Diagnose, falls der
     DOM-Fallback später doch Werbung darin findet. */
  const recentPins = new Map();
  function remember(o) {
    if (typeof o.id !== "string") return;
    recentPins.set(o.id, o);
    if (recentPins.size > 600) recentPins.delete(recentPins.keys().next().value);
  }

  /* Relay/GraphQL verpackt Pins als { node: {...} }. */
  const unwrap = (el) => (el.node && typeof el.node === "object" ? el.node : el);

  function shouldDrop(el, inFeed) {
    if (!el || typeof el !== "object" || Array.isArray(el)) return false;
    const o = unwrap(el);
    if (isPin(o)) {
      if (settings.hideAds && isAdData(o)) return true;
      if (settings.hideVideoPins && isVideoData(o)) return true;
      if (settings.hideShoppablePins && isShopData(o)) return true;
      if (settings.keywordsEnabled && keywords.length && matchesKeywordData(o)) return true;
      remember(o);
      return false;
    }
    /* Nicht-Pin-Kacheln mitten im Pin-Feed: Karussells, Shopping-
       Module, "Mehr Ideen"-Boards, Story-Kacheln. */
    return inFeed && settings.hideModules && typeof (o.type || o.__typename) === "string";
  }

  /* Entfernt unerwünschte Einträge in-place, liefert die Anzahl. */
  function clean(node, depth) {
    if (!node || typeof node !== "object" || depth > 40) return 0;
    let n = 0;
    if (Array.isArray(node)) {
      let pins = 0;
      for (const el of node) if (el && typeof el === "object" && isPin(unwrap(el))) pins++;
      const inFeed = pins >= 2;
      for (let i = node.length - 1; i >= 0; i--) {
        if (shouldDrop(node[i], inFeed)) {
          node.splice(i, 1);
          n++;
        }
      }
      for (const el of node) n += clean(el, depth + 1);
    } else {
      for (const k in node) {
        const v = node[k];
        if (v && typeof v === "object") n += clean(v, depth + 1);
      }
    }
    return n;
  }

  function filterText(text) {
    if (!settings.enabled || typeof text !== "string" || text.length < 50) return text;
    if (!PIN_MARKER.test(text)) return text;
    let data;
    try {
      data = origParse(text);
    } catch (_) {
      return text;
    }
    const n = clean(data, 0);
    if (!n) return text;
    bump(n);
    return origStringify(data);
  }

  function isApiUrl(url) {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin && /\/resource\/|graphql/i.test(u.pathname);
    } catch (_) {
      return false;
    }
  }

  /* ---------- XMLHttpRequest (Pinterests Haupt-Transport) ---------- */
  const XHR = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (XHR) {
    const open = XHR.open;
    XHR.open = function (method, url) {
      this.__pclApi = isApiUrl(String(url));
      return open.apply(this, arguments);
    };

    const filtered = (xhr, raw) => {
      if (xhr.__pclRaw !== raw) {
        xhr.__pclRaw = raw;
        xhr.__pclOut = filterText(raw);
      }
      return xhr.__pclOut;
    };

    const textDesc = Object.getOwnPropertyDescriptor(XHR, "responseText");
    if (textDesc && textDesc.get) {
      Object.defineProperty(XHR, "responseText", {
        configurable: true,
        enumerable: textDesc.enumerable,
        get() {
          const raw = textDesc.get.call(this);
          return this.__pclApi && this.readyState === 4 ? filtered(this, raw) : raw;
        }
      });
    }

    const respDesc = Object.getOwnPropertyDescriptor(XHR, "response");
    if (respDesc && respDesc.get) {
      Object.defineProperty(XHR, "response", {
        configurable: true,
        enumerable: respDesc.enumerable,
        get() {
          const raw = respDesc.get.call(this);
          if (!this.__pclApi || this.readyState !== 4) return raw;
          if (typeof raw === "string") return filtered(this, raw);
          if (raw && typeof raw === "object" && this.responseType === "json" && !this.__pclJson) {
            this.__pclJson = true;
            if (settings.enabled) {
              const n = clean(raw, 0);
              if (n) bump(n);
            }
          }
          return raw;
        }
      });
    }
  }

  /* ---------- fetch ---------- */
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input) {
      const url = typeof input === "string" ? input : input && input.url;
      const promise = origFetch.apply(this, arguments);
      if (!url || !isApiUrl(String(url))) return promise;
      return promise.then(async (res) => {
        const type = res.headers.get("content-type") || "";
        if (res.status !== 200 || !/json/i.test(type)) return res;
        const text = await res.clone().text();
        const out = filterText(text);
        if (out === text) return res;
        const copy = new Response(out, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers
        });
        Object.defineProperty(copy, "url", { value: res.url });
        return copy;
      });
    };
  }

  /* ---------- JSON.parse (eingebettete Startdaten, andere Wege) ---------- */
  JSON.parse = function (text) {
    const value = origParse.apply(this, arguments);
    if (
      settings.enabled &&
      typeof text === "string" &&
      text.length > 2000 &&
      value &&
      typeof value === "object" &&
      PIN_MARKER.test(text)
    ) {
      const n = clean(value, 0);
      if (n) bump(n);
    }
    return value;
  };

  /* ===============================================================
     Ebene 2: DOM-Fallback
     =============================================================== */

  const AD_SELECTORS = [
    '[data-test-id="pin-promoted"]',
    '[data-test-id="promoted-pin"]',
    '[data-test-id="promotedPin"]',
    '[data-test-id="pinrep-promoted-label"]',
    '[data-test-id="oneTapPromotedPin"]',
    '[data-test-id*="promoted" i]',
    '[aria-label*="Promoted" i]',
    '[aria-label*="Gesponsert" i]',
    '[aria-label*="Sponsored" i]',
    '[href*="/promoted/"]'
  ];
  const AD_SELECTOR = AD_SELECTORS.join(",");
  /* Werbe-Labels stehen in eigenen Textknoten – textContent würde sie
     ohne Leerzeichen an den Titel kleben ("…Idee 10Gesponsert"). */
  const AD_LABEL = /^(promoted|sponsored|gesponsert|werbeanzeige|anzeige|werbung|bezahlte partnerschaft)(\s+(by|von)\b.*)?:?$/i;

  const VIDEO_SELECTOR = [
    "video",
    '[data-test-id="pinrep-video"]',
    '[data-test-id="pin-video"]',
    '[data-test-id="story-pin-rep"]',
    '[data-test-id*="video" i]'
  ].join(",");

  const SHOP_SELECTOR = [
    '[data-test-id="shopping-flashlight-icon"]',
    '[data-test-id="product-pin"]',
    '[data-test-id="pin-price"]',
    '[data-test-id="product-price"]',
    '[data-test-id*="shopping" i]',
    '[href*="/shop/"]'
  ].join(",");
  const PRICE_TEXT = /(^|\s)(\$|€|£)\s?\d/;

  const SUGGESTION_SELECTORS = [
    '[data-test-id="search-guide-container"]',
    '[data-test-id="guide-container"]',
    '[data-test-id="search-guides"]',
    '[data-test-id="one-tap-guides"]',
    '[data-test-id="related-searches"]',
    '[data-test-id="interest-rep"]',
    '[aria-label="Suchvorschläge"]',
    '[aria-label="Search suggestions"]'
  ];

  /* Die :has()-Regel blendet erkennbare Werbung schon beim Einfügen
     aus – Pinterest misst sie dann mit Höhe 0 und lässt keine Lücke. */
  const CSS = `
.pcl-hidden { display: none !important; }
html.pcl-on.pcl-ads [data-grid-item="true"]:has(${AD_SELECTOR}) { display: none !important; }
${SUGGESTION_SELECTORS.map((s) => `html.pcl-on.pcl-suggestions ${s}`).join(",\n")} { display: none !important; }
`;

  function injectStyle() {
    const style = document.createElement("style");
    style.id = "pcl-style";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function applyRoot() {
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle("pcl-on", settings.enabled);
    root.classList.toggle("pcl-ads", settings.hideAds);
    root.classList.toggle("pcl-suggestions", settings.hideSearchSuggestions);
  }

  function hasAdLabel(item) {
    if ((item.textContent || "").length > 2000) return false;
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const t = node.nodeValue.trim();
      if (t && t.length < 80 && AD_LABEL.test(t)) return true;
    }
    return false;
  }

  function shortText(el, max) {
    const t = el.textContent || "";
    return t.length <= max ? t : "";
  }

  function matchesKeywordDom(item) {
    let hay = item.textContent || "";
    const img = item.querySelector("img[alt]");
    if (img) hay += " " + img.getAttribute("alt");
    const link = item.querySelector("a[href]");
    if (link) hay += " " + link.getAttribute("href");
    hay = hay.toLowerCase();
    return keywords.some((w) => hay.includes(w));
  }

  const reported = new WeakSet();
  function reportMissedAd(item) {
    if (reported.has(item)) return;
    reported.add(item);
    const link = item.querySelector('a[href*="/pin/"]');
    const id = link && (link.getAttribute("href").match(/\/pin\/([^/?#]+)/) || [])[1];
    const data = id && recentPins.get(id);
    console.warn(
      "[Pinterest Cleaner] Werbung erst im DOM erkannt – der Datenfilter kennt dieses Merkmal noch nicht.",
      id || "(keine Pin-ID)",
      data ? Object.keys(data).sort().join(", ") : "(keine Daten gefunden)"
    );
  }

  function shouldHideDom(item) {
    if (settings.hideAds && (item.querySelector(AD_SELECTOR) || hasAdLabel(item))) {
      reportMissedAd(item);
      return true;
    }
    if (settings.hideVideoPins && item.querySelector(VIDEO_SELECTOR)) return true;
    if (settings.hideShoppablePins && (item.querySelector(SHOP_SELECTOR) || PRICE_TEXT.test(shortText(item, 400)))) return true;
    if (settings.keywordsEnabled && keywords.length && matchesKeywordDom(item)) return true;
    return false;
  }

  /* ---------- Lücken schließen ----------
     Pinterest positioniert jedes Grid-Item absolut (transform/top).
     Für jede ausgeblendete Kachel merken wir uns Spalte (x), Position
     (y) und die Lücke bis zum nächsten Pin darunter. Jeder sichtbare
     Pin wird per margin-top um die Summe der Lücken über ihm in seiner
     Spalte hochgezogen. Die Lücken bleiben gespeichert, auch wenn
     Pinterest die Kachel beim Weiterscrollen aus dem DOM entfernt.

     Grenze: Pinterest rendert nur Pins in Viewport-Nähe – gemessen an
     den eigenen, unverschobenen Positionen. Wird eine Spalte mehr als
     MAX_SHIFT_FACTOR × Fensterhöhe hochgezogen, rendert Pinterest die
     nachrückenden Pins zu spät und unten wird es leer. Darüber hinaus
     bleibt eine Lücke lieber stehen. Im Normalfall greift ohnehin der
     Datenfilter und dieser Fallback kommt kaum zum Einsatz. */
  const MAX_SHIFT_FACTOR = 0.6;
  let holeStore = new WeakMap();

  function posOf(el) {
    const s = el.style;
    let x = parseFloat(s.left) || 0;
    let y = parseFloat(s.top) || 0;
    if (s.transform && s.transform !== "none") {
      try {
        const m = new DOMMatrixReadOnly(s.transform);
        x += m.m41;
        y += m.m42;
      } catch (_) {
        return null;
      }
    } else if (!s.top && !s.left) {
      return null;
    }
    /* x nur für die Spaltenzuordnung runden, y exakt lassen (Subpixel). */
    return { x: Math.round(x), y };
  }

  function compact(container) {
    /* Unsichtbares Grid (z. B. vorherige Seite bei SPA-Navigation)
       würde jede Kachel als Lücke werten. */
    if (!container.getClientRects().length) return;
    const width = container.clientWidth;
    let store = holeStore.get(container);
    /* Neue Breite = Pinterest hat neu gelayoutet, alte Lücken ungültig. */
    if (!store || store.width !== width) {
      store = { width, holes: new Map(), colShift: new Map(), height: null };
      holeStore.set(container, store);
    }

    const entries = [];
    const present = new Set();
    for (const el of container.children) {
      if (el.getAttribute("data-grid-item") !== "true") continue;
      const p = posOf(el);
      if (!p) continue;
      const hidden = el.offsetParent === null;
      entries.push({ el, x: p.x, y: p.y, hidden });
      if (hidden) {
        const key = p.x + "|" + Math.round(p.y);
        present.add(key);
        if (!store.holes.has(key)) store.holes.set(key, { x: p.x, y: p.y, size: 0 });
      }
    }

    for (const [key, hole] of store.holes) {
      /* Größe nur messen, solange die Kachel selbst noch im DOM ist –
         dann ist der nächste gerenderte Pin darunter ihr direkter Nachbar. */
      if (hole.size || !present.has(key)) continue;
      let next = Infinity;
      for (const e of entries) {
        if (Math.abs(e.x - hole.x) <= 1 && e.y > hole.y && e.y < next) next = e.y;
      }
      if (next === Infinity) continue;
      hole.size = next - hole.y;
      const col = store.colShift.get(hole.x) || 0;
      hole.active = col + hole.size <= window.innerHeight * MAX_SHIFT_FACTOR;
      if (hole.active) store.colShift.set(hole.x, col + hole.size);
    }

    for (const e of entries) {
      if (e.hidden) continue;
      let shift = 0;
      for (const h of store.holes.values()) {
        if (h.active && Math.abs(h.x - e.x) <= 1 && h.y < e.y) shift += h.size;
      }
      const want = shift ? `-${shift}px` : "";
      if (e.el.style.marginTop !== want) e.el.style.marginTop = want;
    }

    /* Raster-Höhe um die kleinste Spaltenverschiebung kürzen, sonst
       bleibt unten Leerraum und Pinterest lädt zu spät nach. React
       überschreibt die Höhe bei jedem Render – dann neu übernehmen. */
    const current = container.style.height;
    if (current && current !== store.height) store.origHeight = parseFloat(current);
    if (store.origHeight && store.colShift.size) {
      const columns = new Set(entries.map((e) => e.x)).size;
      const shifts = [...store.colShift.values()];
      const minShift = shifts.length >= columns ? Math.min(...shifts) : 0;
      store.height = minShift ? `${store.origHeight - minShift}px` : current;
      if (container.style.height !== store.height) container.style.height = store.height;
    }
  }

  function scan() {
    applyRoot();
    if (!settings.enabled) return;
    const containers = new Set();
    for (const item of document.querySelectorAll('[data-grid-item="true"]')) {
      if (item.parentElement) containers.add(item.parentElement);
      const hide = shouldHideDom(item);
      if (hide && !item.classList.contains("pcl-hidden")) {
        item.classList.add("pcl-hidden");
        bump(1);
      } else if (!hide && item.classList.contains("pcl-hidden")) {
        item.classList.remove("pcl-hidden");
      }
    }
    containers.forEach(compact);
  }

  function resetDom() {
    holeStore = new WeakMap();
    for (const el of document.querySelectorAll(".pcl-hidden")) el.classList.remove("pcl-hidden");
    for (const el of document.querySelectorAll('[data-grid-item="true"]')) el.style.marginTop = "";
  }

  function safeScan() {
    try {
      scan();
    } catch (err) {
      console.debug("[Pinterest Cleaner] scan failed", err);
    }
  }

  /* Scroll/Resize: höchstens einmal pro Frame. */
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      safeScan();
    });
  }

  /* Live-Updates aus dem Extension-Popup (über content/bridge.js). */
  window.addEventListener("pcl:settings", (e) => {
    try {
      settings = { ...DEFAULTS, ...origParse(e.detail) };
    } catch (_) {
      return;
    }
    keywords = parseKeywords(settings.keywords);
    resetDom();
    safeScan();
  });

  function start() {
    injectStyle();
    applyRoot();
    if (document.documentElement) document.documentElement.dataset.pclRemoved = String(removed);
    /* Neue Pins direkt im Observer prüfen (Microtask): läuft sofort nach
       dem Einfügen und sicher vor dem nächsten Zeichnen – auch in Tabs,
       in denen requestAnimationFrame gerade pausiert. */
    new MutationObserver(safeScan).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    schedule();
  }

  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
