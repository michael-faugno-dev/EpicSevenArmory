// Render API base (Hosted Test / Release)
var API_BASE = "https://epicsevenarmoryserver-87gz.onrender.com";

var helperLoaded = false;
var authToken = null;
var channelId = null;

var saveBtn = document.getElementById("saveBtn");
var autoBtn = document.getElementById("autoBtn");
var statusEl = document.getElementById("status");
var autoLine = document.getElementById("autoLine");
var roleLine = document.getElementById("roleLine");
var envBadge = document.getElementById("envBadge");
var usernameInput = document.getElementById("username");

function setStatus(msg, cls) {
  if (!cls) cls = "muted";
  statusEl.textContent = msg;
  statusEl.className = cls;
}

function setAutoLine(msg, cls) {
  if (!autoLine) return;
  if (!cls) cls = "muted";
  autoLine.textContent = msg;
  autoLine.className = "auto-line " + cls;
}

function setBadge(text) {
  if (envBadge) envBadge.textContent = text;
}

// Parse a server response body and return a readable error string.
function parseErrorBody(body, httpStatus) {
  try {
    var j = JSON.parse(body);
    var msg = j.error || j.error_message || j.message || body;
    return "HTTP " + httpStatus + ": " + msg;
  } catch (_) {
    return "HTTP " + httpStatus + ": " + (body || "(empty)");
  }
}

// Fetch with full error detail — resolves with parsed JSON on success,
// rejects with a descriptive Error on any non-2xx or network failure.
function apiFetch(url, opts) {
  return fetch(url, opts).then(function (resp) {
    return resp.text().then(function (body) {
      if (!resp.ok) {
        throw new Error(parseErrorBody(body, resp.status));
      }
      try { return JSON.parse(body); } catch (_) { return body; }
    });
  });
}

// Look up which Armory username is linked to the broadcaster's Twitch account.
// Auto-fills the username field if found.
function autoDetectAccount() {
  if (!authToken) return;
  setAutoLine("Looking up your linked Armory account…");
  if (autoBtn) autoBtn.disabled = true;

  apiFetch(API_BASE + "/twitch/my_armory", {
    headers: { Authorization: "Bearer " + authToken },
  })
    .then(function (data) {
      if (data && data.username) {
        usernameInput.value = data.username;
        setAutoLine(
          "\u2713 Found linked account: " + data.username +
          ". Click \u2018Connect Channel\u2019 to save.",
          "ok"
        );
      } else {
        setAutoLine(
          "No Armory account linked to this Twitch yet. " +
          "Open the Armory desktop app \u2192 Profile \u2192 Link Twitch, then click Find My Account.",
          "err"
        );
      }
    })
    .catch(function (e) {
      var msg = String(e.message || e);
      if (msg.indexOf("Failed to fetch") !== -1) {
        setAutoLine("Could not reach server. Check URL Fetching allowlist.", "err");
      } else {
        setAutoLine("Auto-detect error: " + msg, "err");
      }
    })
    .finally(function () {
      if (autoBtn) autoBtn.disabled = false;
    });
}

try {
  if (window.Twitch && window.Twitch.ext) helperLoaded = true;
} catch (e) {}

if (helperLoaded) {
  setBadge("helper ok");

  Twitch.ext.onAuthorized(function (auth) {
    authToken = auth.token;
    channelId = auth.channelId;
    var role = auth.role || "unknown";
    roleLine.textContent =
      "Authorized as Twitch " + role + ". Channel ID: " + channelId;

    setStatus("Checking current configuration…");

    // Check if this channel already has a mapping saved
    apiFetch(API_BASE + "/twitch/channel_config", {
      headers: { Authorization: "Bearer " + authToken },
    })
      .then(function (data) {
        if (data && data.username) {
          if (!usernameInput.value) usernameInput.value = data.username;
          setStatus(
            "Currently connected to: " + data.username +
            ". Edit and click Connect Channel to update.",
            "ok"
          );
        } else {
          setStatus("No channel mapped yet. Use Find My Account or enter your username below.");
        }
      })
      .catch(function (e) {
        var msg = String(e.message || e);
        if (msg.indexOf("Failed to fetch") !== -1) {
          setStatus("Could not reach server (" + API_BASE + "). Check URL Fetching allowlist.", "err");
        } else {
          setStatus("Load error \u2014 " + msg, "err");
        }
      });

    // Auto-detect linked Armory account from Twitch identity
    autoDetectAccount();
  });

  Twitch.ext.configuration.onChanged(function () {
    try {
      var b = Twitch.ext.configuration.broadcaster;
      if (b && b.content) {
        var parsed = JSON.parse(b.content);
        if (parsed && parsed.username && !usernameInput.value) {
          usernameInput.value = parsed.username;
        }
      }
    } catch (e) {}
  });
} else {
  setBadge("helper NOT loaded");
  roleLine.textContent =
    "Twitch helper did not initialize. Open this from the Twitch 'Configure' button.";
  setStatus("Reload the popup. If it persists, check Asset Hosting paths.", "err");
}

if (autoBtn) {
  autoBtn.addEventListener("click", autoDetectAccount);
}

saveBtn.addEventListener("click", function () {
  var username = (usernameInput.value || "").trim();
  if (!username) {
    setStatus("Please enter your E7 Armory username.", "err");
    return;
  }
  if (!helperLoaded) {
    setStatus("Helper not loaded. Open this from Twitch 'Configure'.", "err");
    return;
  }
  if (!authToken) {
    setStatus("Not authorized yet \u2014 no token from Twitch. Try reopening the config.", "err");
    return;
  }

  setStatus("Connecting channel\u2026");
  apiFetch(API_BASE + "/twitch/map_channel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + authToken,
    },
    body: JSON.stringify({ username: username }),
  })
    .then(function () {
      try {
        Twitch.ext.configuration.set("broadcaster", "1", JSON.stringify({ username: username }));
      } catch (e) {}
      setStatus("Channel connected! Overlay can now read your selected units.", "ok");
    })
    .catch(function (e) {
      var msg = String(e.message || e);
      if (msg.indexOf("Failed to fetch") !== -1) {
        setStatus(
          "Could not reach server (" + API_BASE + "). Check URL Fetching allowlist in Twitch Dev Console.",
          "err"
        );
      } else {
        setStatus("Connect failed \u2014 " + msg, "err");
      }
    });
});
