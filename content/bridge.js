/* ---------------------------------------------------------------
   Pinterest Cleaner – Brücke (isolierter Content-Script-Kontext)
   cleaner.js läuft im Seitenkontext und hat kein chrome.storage.
   Diese Datei spiegelt die Einstellungen nach localStorage (damit
   cleaner.js sie beim nächsten Laden synchron hat) und schickt
   Änderungen live per Event. Außerdem beantwortet sie die
   Zähler-Anfrage des Popups.
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

  function push(settings) {
    const json = JSON.stringify({ ...DEFAULTS, ...settings });
    try {
      localStorage.setItem("pcl:settings", json);
    } catch (_) {
      /* privates Fenster o. Ä. – Live-Event reicht */
    }
    window.dispatchEvent(new CustomEvent("pcl:settings", { detail: json }));
  }

  chrome.storage.sync.get(DEFAULTS, push);

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "sync") chrome.storage.sync.get(DEFAULTS, push);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg === "pcl:stats") {
      reply({ removed: Number(document.documentElement.dataset.pclRemoved || 0) });
    }
  });
})();
