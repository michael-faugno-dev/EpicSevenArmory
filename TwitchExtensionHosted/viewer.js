// ===== Epic Seven Armory — Twitch Overlay JS (drop-in) =====

// ─── Config ───────────────────────────────────────────────────────────────────
const API = "https://epicsevenarmoryserver-1.onrender.com";
const USE_API_IMAGE_CACHE = false; // true => use `${API}/images/hero/<slug>` proxy
const LOCAL_FALLBACK_USERNAME = "faugnom1"; // local testing (non-Twitch)

// ─── State ───────────────────────────────────────────────────────────────────
let selectedUnits = [];
let tabImages = {};
const fetchedImageFor = new Set();
let isOpen = true;
let activeTabIndex = null;

let hasTwitch = false;
let authToken = null;
let configUsername = null;

try {
  hasTwitch = !!(window.Twitch && window.Twitch.ext);
} catch (e) {}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function slugify(name) {
  // kebab-case file slug that matches your GitHub filenames
  const s = (name || "").toLowerCase().trim();
  let out = "";
  let prevHyphen = false;
  for (const ch of s) {
    if (/[a-z0-9]/.test(ch)) {
      out += ch;
      prevHyphen = false;
    } else if (!prevHyphen) {
      out += "-";
      prevHyphen = true;
    }
  }
  out = out.replace(/^-+|-+$/g, "");
  if (out === "ainos-2-0") out = "ainos-20"; // special case
  return out;
}

function portraitUrlFromAPI(unitName) {
  // No extension needed; backend tries .png/.jpg/.jpeg/.webp in order
  return `${API}/images/hero/${slugify(unitName)}`;
}

// ─── Sidebar "pin" to left (handles Twitch layout animation) ─────────────────
(function ensureSidebarPinned() {
  const el = () => document.getElementById("sidebar");
  let to = null;

  function pin() {
    const s = el();
    if (!s) return;
    s.style.left = "0px"; // hard anchor
    void s.offsetHeight; // reflow to cancel transient offsets
  }
  function debouncePin() {
    clearTimeout(to);
    to = setTimeout(pin, 80); // wait for Twitch player resize animation
  }

  window.addEventListener("load", pin);
  document.addEventListener("DOMContentLoaded", pin);
  window.addEventListener("resize", debouncePin);
  document.addEventListener("visibilitychange", pin);

  // extra passes post-load to catch late layout
  setTimeout(pin, 0);
  setTimeout(pin, 150);
})();

// ─── UI Bindings ─────────────────────────────────────────────────────────────
function bindUI() {
  const toggle = document.getElementById("toggleBtn");
  if (toggle) toggle.addEventListener("click", toggleSidebar);

  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleTabClick(parseInt(btn.dataset.index, 10))
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindUI();

  if (hasTwitch) {
    // read broadcaster configuration (username fallback)
    Twitch.ext.configuration.onChanged(() => {
      try {
        const bcfg = Twitch.ext.configuration.broadcaster;
        if (bcfg && bcfg.content) {
          const parsed = JSON.parse(bcfg.content);
          if (parsed && parsed.username) configUsername = parsed.username;
        }
      } catch (_) {}
    });

    // auth gives us the extension JWT
    Twitch.ext.onAuthorized((auth) => {
      authToken = auth.token || null;
      startPolling(true);
    });
  } else {
    // local browser usage
    startPolling(true);
  }
});

// ─── Polling ─────────────────────────────────────────────────────────────────
function startPolling(firstRun) {
  refreshSelectedUnits(firstRun); // immediate on load
  setInterval(() => refreshSelectedUnits(false), 2000); // gentle poll
}

// ─── Data Fetch ───────────────────────────────────────────────────────────────
async function refreshSelectedUnits(allowInitActiveIndex) {
  try {
    let incoming = [];

    // 1) Preferred: Twitch JWT → EBS
    if (hasTwitch && authToken) {
      const r = await fetch(`${API}/twitch/selected_units`, {
        method: "GET",
        headers: { Authorization: "Bearer " + authToken },
      });
      if (r.ok) incoming = await r.json();
    }

    // 2) Fallback: broadcaster-config username or local test username
    if (
      (!incoming || incoming.length === 0) &&
      (configUsername || !hasTwitch)
    ) {
      const uname = hasTwitch ? configUsername : LOCAL_FALLBACK_USERNAME;
      if (uname) {
        const r2 = await fetch(`${API}/get_selected_units_data`, {
          method: "GET",
          headers: { Username: uname },
        });
        if (r2.ok) incoming = await r2.json();
      }
    }

    selectedUnits = Array.isArray(incoming) ? incoming.slice(0, 4) : [];

    // maintain active tab position
    if (allowInitActiveIndex && activeTabIndex === null) {
      activeTabIndex = selectedUnits.length ? 0 : null;
    }
    if (activeTabIndex !== null && activeTabIndex >= selectedUnits.length) {
      activeTabIndex = selectedUnits.length ? selectedUnits.length - 1 : null;
    }

    // kick off portrait fetches lazily
    selectedUnits.forEach((u) => {
      if (!u || !u.unit) return;
      if (!tabImages[u.unit] && !fetchedImageFor.has(u.unit)) {
        fetchedImageFor.add(u.unit);
        fetchUnitImage(u.unit).catch(() => {});
      }
    });

    renderTabs();
    renderContent();
  } catch (_) {
    // quiet inside Twitch overlay
  }
}

async function fetchUnitImage(unitName) {
  try {
    if (USE_API_IMAGE_CACHE) {
      // Use your Render proxy (GitHub-backed)
      tabImages[unitName] = portraitUrlFromAPI(unitName);
      renderTabs();
      return;
    }

    // Fallback: epic7db (older behavior)
    const slug = slugify(unitName);
    const res = await fetch(
      `https://epic7db.com/api/heroes/${slug}/mikeyfogs`,
      {
        cache: "force-cache",
      }
    );
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.image) {
      tabImages[unitName] = data.image;
      renderTabs();
    }
  } catch (_) {}
}

// ─── UI Actions ──────────────────────────────────────────────────────────────
function toggleSidebar() {
  isOpen = !isOpen;
  const sidebar = document.getElementById("sidebar");
  const toggleButton = document.getElementById("toggleBtn");
  if (isOpen) {
    sidebar.classList.remove("closed");
    sidebar.classList.add("open");
    toggleButton.textContent = "<<";
    toggleButton.setAttribute("aria-expanded", "true");
  } else {
    sidebar.classList.remove("open");
    sidebar.classList.add("closed");
    toggleButton.textContent = ">>";
    toggleButton.setAttribute("aria-expanded", "false");
  }
}

function handleTabClick(index) {
  if (selectedUnits[index]) {
    activeTabIndex = index;
    renderTabs();
    renderContent();
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function renderTabs() {
  const tabs = document.querySelectorAll(".tab-button");
  tabs.forEach((tab, i) => {
    const unit = selectedUnits[i];
    tab.className = "tab-button";
    if (unit) {
      tab.classList.add("filled");
      if (i === activeTabIndex) tab.classList.add("active");
      if (tabImages[unit.unit]) {
        tab.style.backgroundImage = `url(${tabImages[unit.unit]})`;
        tab.textContent = "";
      } else {
        tab.style.backgroundImage = "";
        tab.textContent = unit.unit;
      }
    } else {
      tab.classList.add("empty");
      tab.style.backgroundImage = "";
      tab.textContent = "";
    }
  });
}

function renderContent() {
  const el = document.getElementById("content");
  el.innerHTML = "";
  if (activeTabIndex === null) return;
  const unit = selectedUnits[activeTabIndex];
  if (!unit) return;

  const unitDiv = document.createElement("div");
  unitDiv.className = "unit";
  unitDiv.innerHTML = `
    <h2>${unit.unit}</h2>
    <p>Attack: ${unit.attack}</p>
    <p>Defense: ${unit.defense}</p>
    <p>Health: ${unit.health}</p>
    <p>Speed: ${unit.speed}</p>
    <p>Critical Hit Chance: ${unit.critical_hit_chance}</p>
    <p>Critical Hit Damage: ${unit.critical_hit_damage}</p>
    <p>Effectiveness: ${unit.effectiveness}</p>
    <p>Effect Resistance: ${unit.effect_resistance}</p>
    ${unit.set1 ? `<p>Set: ${unit.set1}</p>` : ""}
    ${unit.set2 ? `<p>Set: ${unit.set2}</p>` : ""}
    ${unit.set3 ? `<p>Set: ${unit.set3}</p>` : ""}
  `;
  el.appendChild(unitDiv);
}
