// ─────────────────────────────────────────────────────────────
// Render API base (EBS). Must be in Twitch URL-fetching allowlist.
// ─────────────────────────────────────────────────────────────
var API_BASE = "https://epicsevenarmoryserver-1.onrender.com";

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────
var accessToken = null; // Twitch JWT from helper
var pollingHandle = null; // refresh timer
var selectedUnits = []; // [{ unit, attack, ... }, ...] (max 4)
var tabImages = {}; // { "Apoc Ravi": "https://..." }
var activeTab = null; // unit name

// DOM
var tabsEl = document.getElementById("tabs");
var detailsEl = document.getElementById("details");

// ─────────────────────────────────────────────────────────────
// Data fetchers
// ─────────────────────────────────────────────────────────────
function loadSelectedUnits() {
  if (!accessToken) return;

  fetch(API_BASE + "/twitch/get_selected_units_data", {
    method: "GET",
    headers: { Authorization: "Bearer " + accessToken },
  })
    .then(function (resp) {
      if (!resp.ok) {
        console.warn("overlay fetch failed:", resp.status);
        return null;
      }
      return resp.json();
    })
    .then(function (data) {
      if (!data) return;
      // Keep only up to 4
      selectedUnits = Array.isArray(data) ? data.slice(0, 4) : [];
      if (selectedUnits.length) {
        // ensure active tab
        if (
          !activeTab ||
          !selectedUnits.find(function (u) {
            return u && u.unit === activeTab;
          })
        ) {
          activeTab = selectedUnits[0].unit;
        }
        // prefetch images
        selectedUnits.forEach(function (u) {
          if (u && u.unit) prefetchUnitImage(u.unit);
        });
      } else {
        activeTab = null;
      }
      renderTabs();
      renderDetails();
    })
    .catch(function (e) {
      console.error("overlay fetch error:", e);
    });
}

function prefetchUnitImage(unitName) {
  if (!unitName || tabImages[unitName]) return; // cached

  var safe = unitName.replace(/ /g, "-");
  // small CDN API that returns { image: "..." }
  fetch("https://epic7db.com/api/heroes/" + safe + "/mikeyfogs")
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (data && data.image) {
        tabImages[unitName] = data.image;
        renderTabs(); // update background if this tab is visible
      }
    })
    .catch(function (e) {
      console.warn("hero image fetch failed for", unitName, e);
    });
}

// ─────────────────────────────────────────────────────────────
// Renderers
// ─────────────────────────────────────────────────────────────
function renderTabs() {
  var slots = [0, 1, 2, 3];
  tabsEl.innerHTML = "";

  slots.forEach(function (i) {
    var unit = selectedUnits[i];

    var btn = document.createElement("button");
    btn.className = "tab-btn " + (unit ? "filled" : "empty");

    if (unit) {
      if (tabImages[unit.unit]) {
        btn.style.backgroundImage = "url(" + tabImages[unit.unit] + ")";
      } else {
        btn.textContent = unit.unit;
      }
      if (activeTab === unit.unit) btn.classList.add("active");
      btn.addEventListener("click", function () {
        setActive(unit.unit);
      });
    } else {
      btn.textContent = "Empty";
    }

    tabsEl.appendChild(btn);
  });
}

function renderDetails() {
  detailsEl.innerHTML = "";

  if (!selectedUnits.length) {
    detailsEl.innerHTML =
      '<div class="muted">No units selected yet. Choose 4 in your desktop app.</div>';
    return;
  }

  var unit =
    selectedUnits.find(function (u) {
      return u && u.unit === activeTab;
    }) || selectedUnits[0];

  if (!unit) {
    detailsEl.innerHTML =
      '<div class="muted">Select a tab to view stats.</div>';
    return;
  }

  var html =
    "<h2>" +
    escapeHtml(unit.unit || "Unit") +
    "</h2>" +
    '<div class="statline">' +
    "<span>ATK: " +
    safe(unit.attack) +
    "</span>" +
    "<span>DEF: " +
    safe(unit.defense) +
    "</span>" +
    "<span>HP: " +
    safe(unit.health) +
    "</span>" +
    "<span>SPD: " +
    safe(unit.speed) +
    "</span>" +
    "</div>" +
    '<div class="statline">' +
    "<span>CHC: " +
    safe(unit.critical_hit_chance) +
    "</span>" +
    "<span>CHD: " +
    safe(unit.critical_hit_damage) +
    "</span>" +
    "<span>EFF: " +
    safe(unit.effectiveness) +
    "</span>" +
    "<span>RES: " +
    safe(unit.effect_resistance) +
    "</span>" +
    "</div>" +
    (unit.set1
      ? '<div class="statline"><span>Set: ' +
        safe(unit.set1) +
        "</span>" +
        (unit.set2 ? "<span>Set: " + safe(unit.set2) + "</span>" : "") +
        (unit.set3 ? "<span>Set: " + safe(unit.set3) + "</span>" : "") +
        "</div>"
      : "");

  detailsEl.innerHTML = html;
}

function setActive(unitName) {
  activeTab = unitName;
  if (!tabImages[unitName]) prefetchUnitImage(unitName);
  renderTabs();
  renderDetails();
}

// ─────────────────────────────────────────────────────────────
// Twitch helper wiring
// ─────────────────────────────────────────────────────────────
Twitch.ext.onAuthorized(function (auth) {
  accessToken = auth.token;
  loadSelectedUnits();
  if (pollingHandle) clearInterval(pollingHandle);
  pollingHandle = setInterval(loadSelectedUnits, 5000);
});

window.addEventListener("beforeunload", function () {
  if (pollingHandle) clearInterval(pollingHandle);
});

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────
function safe(v) {
  return v === null || v === undefined ? "" : String(v);
}
function escapeHtml(s) {
  s = safe(s);
  return s.replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}
