// Render API base (Hosted Test / Release)
var API_BASE = "https://epicsevenarmoryserver-1.onrender.com";

var helperLoaded = false;
var authToken = null;
var channelId = null;

var saveBtn = document.getElementById("saveBtn");
var statusEl = document.getElementById("status");
var roleLine = document.getElementById("roleLine");
var envBadge = document.getElementById("envBadge");
var usernameInput = document.getElementById("username");

function setStatus(msg, cls) {
  if (!cls) cls = "muted";
  statusEl.textContent = msg;
  statusEl.className = cls;
}

function setBadge(text) {
  if (envBadge) envBadge.textContent = text;
}

try {
  if (window.Twitch && window.Twitch.ext) helperLoaded = true;
} catch (e) {}

if (helperLoaded) {
  setBadge("helper ok");

  // onAuthorized fires when the Twitch extension JWT is ready.
  // We use it to:
  //   1. Display the broadcaster's Twitch role and channel ID.
  //   2. Fetch the current server-side channel→username mapping so the input
  //      is pre-populated from the DB rather than only from Twitch CDN storage
  //      (CDN storage can be empty on first load or after a cache clear).
  Twitch.ext.onAuthorized(function (auth) {
    authToken = auth.token;
    channelId = auth.channelId;
    var role = auth.role || "unknown";
    roleLine.textContent =
      "Authorized as Twitch " + role + ". Channel ID: " + channelId;

    setStatus("Checking current configuration…");

    // Fetch current DB mapping for this channel.
    fetch(API_BASE + "/twitch/channel_config", {
      headers: { Authorization: "Bearer " + authToken },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.username) {
          // Pre-populate only if the user hasn't already typed something.
          if (!usernameInput.value) {
            usernameInput.value = data.username;
          }
          setStatus(
            "Currently connected to: " +
              data.username +
              ". Edit the field and click Connect Channel to update.",
            "ok"
          );
        } else {
          setStatus(
            "No channel mapped yet. Enter your E7 Armory username and click Connect Channel."
          );
        }
      })
      .catch(function () {
        // Server unreachable — fall back to whatever Twitch CDN storage has.
        setStatus(
          "Could not reach server. Enter your E7 Armory username and click Connect Channel.",
          "err"
        );
      });
  });

  // onChanged fires when the Twitch broadcaster configuration changes (CDN-backed).
  // We use it as a secondary fallback: if the server fetch above already set the
  // username, !usernameInput.value will be false and this is a no-op.
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
  setStatus(
    "Reload the popup. If it persists, check Asset Hosting paths.",
    "err"
  );
}

function mapChannel(username) {
  var headers = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = "Bearer " + authToken;
  return fetch(API_BASE + "/twitch/map_channel", {
    method: "POST",
    headers: headers,
    body: JSON.stringify({ username: username }),
  });
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
    setStatus("Not authorized yet. Try again in a moment.", "err");
    return;
  }

  setStatus("Connecting channel…");
  mapChannel(username)
    .then(function (resp) {
      if (!resp.ok)
        return resp.text().then(function (t) {
          throw new Error("EBS " + resp.status + ": " + t);
        });
      // Also persist to Twitch CDN storage as a secondary cache.
      try {
        Twitch.ext.configuration.set(
          "broadcaster",
          "1",
          JSON.stringify({ username: username })
        );
      } catch (e) {}
      setStatus(
        "Channel connected! Overlay can now read your selected units.",
        "ok"
      );
    })
    .catch(function (e) {
      console.error(e);
      if (String(e).indexOf("Failed to fetch") !== -1) {
        setStatus(
          "Failed to reach API. Confirm URL Fetching allowlist includes your Render domain.",
          "err"
        );
      } else {
        setStatus(e.message || "Error", "err");
      }
    });
});
