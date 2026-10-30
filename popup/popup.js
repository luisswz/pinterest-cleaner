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

const CHECKBOXES = [
  "enabled",
  "hideAds",
  "hideModules",
  "hideSearchSuggestions",
  "hideVideoPins",
  "hideShoppablePins",
  "keywordsEnabled"
];

const $ = (id) => document.getElementById(id);

function save(patch) {
  chrome.storage.sync.set(patch);
}

function flashSaved() {
  const hint = $("savedHint");
  hint.classList.add("show");
  setTimeout(() => hint.classList.remove("show"), 1200);
}

function showStats() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, "pcl:stats", (res) => {
      if (chrome.runtime.lastError || !res) return;
      $("stats").innerHTML = `Auf dieser Seite entfernt: <strong>${res.removed}</strong>`;
    });
  });
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  for (const id of CHECKBOXES) $(id).checked = !!s[id];
  $("keywords").value = s.keywords || "";
});

for (const id of CHECKBOXES) {
  $(id).addEventListener("change", (e) => save({ [id]: e.target.checked }));
}

function saveKeywords() {
  save({ keywords: $("keywords").value });
  flashSaved();
}

$("save").addEventListener("click", saveKeywords);
$("keywords").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    saveKeywords();
  }
});

showStats();
setInterval(showStats, 1000);
