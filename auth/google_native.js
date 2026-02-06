// auth/google_native.js
// Desktop (Electron) Google OAuth with System Browser + Loopback + PKCE.
// Reads client_id/client_secret from config JSON if not passed in.
// Returns { ok, id_token, access_token, refresh_token?, scope, token_type, expires_in, profile }

const http = require("http");
const https = require("https");
const { URL } = require("url");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { shell } = require("electron");

function base64url(input) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest();
}
function randomString(len = 64) {
  return base64url(crypto.randomBytes(len));
}

function decodeJwtPayload(idToken) {
  try {
    const payload = idToken.split(".")[1];
    const pad =
      payload.length % 4 === 2 ? "==" : payload.length % 4 === 3 ? "=" : "";
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function loadGoogleConfig() {
  const candidates = [
    // dev tree
    path.join(__dirname, "..", "backend", "config", "google_oauth.json"),
    path.join(__dirname, "..", "config", "google_oauth.json"),
    // packaged app (resourcesPath)
    process.resourcesPath
      ? path.join(
          process.resourcesPath,
          "backend",
          "config",
          "google_oauth.json"
        )
      : null,
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const json = JSON.parse(raw);
        return {
          clientId: (json.client_id || "").trim(),
          clientSecret: (json.client_secret || "").trim(),
          path: p,
        };
      }
    } catch {
      // ignore and try next
    }
  }
  return {
    clientId: (process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
    path: "(env)",
  };
}

function startLoopbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const redirect = `http://127.0.0.1:${port}/oauth2cb`;
      resolve({ server, redirect, port });
    });
  });
}

function waitForAuthCode(server, expectedState) {
  return new Promise((resolve, reject) => {
    const handler = (req, res) => {
      try {
        const url = new URL(req.url, "http://127.0.0.1");
        if (url.pathname !== "/oauth2cb") {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state || state !== expectedState) {
          res.statusCode = 400;
          res.end("Invalid request");
          reject(new Error("Invalid code/state"));
          try {
            server.close();
          } catch {}
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(`<html><body style="font-family:system-ui;padding:20px;">
          <h3>Login complete</h3><p>You can close this window and return to the app.</p>
        </body></html>`);
        resolve(code);
        setTimeout(() => {
          try {
            server.close();
          } catch {}
        }, 250);
      } catch (e) {
        reject(e);
        try {
          server.close();
        } catch {}
      }
    };
    server.on("request", handler);
  });
}

function tokenRequest(params) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(params).toString();
    const req = https.request(
      {
        method: "POST",
        hostname: "oauth2.googleapis.com",
        path: "/token",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200)
            return reject(new Error(`Token HTTP ${res.statusCode}: ${body}`));
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function googleDesktopSignIn({
  clientId,
  clientSecret = "",
  scopes = ["openid", "email", "profile"],
} = {}) {
  // Load from config if not provided
  if (!clientId) {
    const cfg = loadGoogleConfig();
    clientId = cfg.clientId;
    if (!clientSecret) clientSecret = cfg.clientSecret;
    if (!clientId)
      throw new Error(
        "Missing client_id. Create backend/config/google_oauth.json with your Google Desktop Client ID."
      );
  }

  // 1) Loopback + PKCE
  const { server, redirect } = await startLoopbackServer();
  const code_verifier = randomString(64);
  const code_challenge = base64url(sha256(Buffer.from(code_verifier)));
  const state = randomString(32);

  // 2) Auth URL
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirect);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("code_challenge", code_challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline"); // refresh_token on first consent
  authUrl.searchParams.set("prompt", "consent");

  await shell.openExternal(authUrl.toString());

  // 3) Receive code at loopback
  const code = await waitForAuthCode(server, state);

  // 4) Exchange code -> tokens (include client_secret iff provided)
  const tokenParams = {
    code,
    client_id: clientId,
    redirect_uri: redirect,
    grant_type: "authorization_code",
    code_verifier,
  };
  if (clientSecret) tokenParams.client_secret = clientSecret;

  const tokenRes = await tokenRequest(tokenParams);
  const {
    id_token,
    access_token,
    refresh_token,
    scope,
    token_type,
    expires_in,
  } = tokenRes;
  const profile = id_token ? decodeJwtPayload(id_token) : {};

  return {
    ok: true,
    id_token,
    access_token,
    refresh_token,
    scope,
    token_type,
    expires_in,
    profile,
  };
}

module.exports = { googleDesktopSignIn };
