// Render API base (Hosted Test / Release)
var API_BASE = "https://epicsevenarmoryserver-87gz.onrender.com";

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
  // After authorization, fetch the current DB mapping so the input is
  // pre-populated from the server, not just from Twitch CDN storage.
  Twitch.ext.onAuthorized(function (auth) {
    authToken = auth.token;
    channelId = auth.channelId;
    var role = auth.role || "unknown";
    roleLine.textContent =
      "Authorized as Twitch " + role + ". Channel ID: " + channelId;

    setStatus("Checking current configuration…");

    fetch(API_BASE + "/twitch/channel_config", {
      headers: { Authorization: "Bearer " + authToken },
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.username) {
          if (!usernameInput.value) {
            usernameInput.value = data.username;
          }
          setStatus(
            "Currently connected to: " + data.username +
            ". Edit and click Connect Channel to update.",
            "ok"
          );
        } else {
          setStatus("No channel mapped yet. Enter your E7 Armory username and click Connect Channel.");
        }
      })
      .catch(function () {
        setStatus(
          "Could not reach server. Enter your E7 Armory username and click Connect Channel.",
          "err"
        );
      });
  });

  // Secondary fallback: pre-populate from Twitch CDN storage if the server
  // fetch above hasn't set the value yet.
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
