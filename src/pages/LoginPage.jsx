// LoginPage.jsx
//
// Two-step Google OAuth flow for the Electron desktop app:
//   Step 1 (Electron → Google): window.api.googleSignIn() (IPC to main.js)
//     triggers the PKCE loopback flow in auth/google_native.js and returns an
//     ID token from Google's token endpoint.
//   Step 2 (Renderer → Flask): POST /auth/google/native with that ID token.
//     The backend verifies with Google, upserts the user in MongoDB, and issues
//     a signed app JWT that is stored via AuthContext.loginWithToken().
//
// After login, new users (profile_completed === false) are sent to /profile;
// returning users go straight to /your_units.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from "../components/GoogleSignInButton";
import { API_BASE } from '../api/client';

export default function LoginPage() {
  const navigate = useNavigate();
  const auth = (() => { try { return useAuth(); } catch { return {}; } })();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (auth?.isAuthenticated) {
      navigate('/your_units', { replace: true });
    }
  }, [auth?.isAuthenticated, navigate]);

  const signInWithGoogle = async () => {
    setErr('');
    setBusy(true);
    try {
      if (!window.api || !window.api.googleSignIn) {
        throw new Error('Google sign-in is not available in this build.');
      }
      const g = await window.api.googleSignIn();
      if (!g || !g.ok || !g.id_token) {
        throw new Error(g && g.error ? g.error : 'Google sign-in failed.');
      }

      const resp = await fetch(`${API_BASE}/auth/google/native`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: g.id_token }),
      });
      const body = await resp.json();
      if (!resp.ok || !body?.success || !body?.token) {
        const msg = body?.error_message || body?.error || `Auth failed (HTTP ${resp.status})`;
        throw new Error(msg);
      }

      if (auth && typeof auth.loginWithToken === 'function') {
        auth.loginWithToken(body.token, { username: body.username });
      } else {
        localStorage.setItem('token', body.token);
        if (body.username) localStorage.setItem('username', body.username);
      }

      // clear any stale per-user fields
      localStorage.removeItem('epic_seven_account');
      localStorage.removeItem('streamer_name');
      localStorage.removeItem('rta_rank');

      if (body.profile_completed) {
        navigate('/your_units', { replace: true });
      } else {
        sessionStorage.setItem('e7_show_welcome', '1');
        navigate('/profile', { replace: true, state: { showWelcome: true } });
      }
    } catch (e) {
      console.error('[LoginPage] Google auth error:', e);
      setErr(e.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px", gap: 32 }}>

      {/* Hero / branding */}
      <div style={{ textAlign: "center", maxWidth: 520 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 10px" }}>Epic Seven Armory</h1>
        <p style={{ fontSize: 15, opacity: 0.65, margin: 0, lineHeight: 1.6 }}>
          Track, compare, and showcase your Epic Seven roster. Auto-import heroes directly
          from your game client, display your units on your Twitch overlay, and look up
          any hero's stats in seconds.
        </p>
      </div>

      {/* Feature highlights */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
        width: "100%",
        maxWidth: 560,
      }}>
        {[
          { icon: "⚔️", title: "Hero Roster", desc: "Import and manage your full collection of heroes and their stats." },
          { icon: "📡", title: "Auto Import", desc: "Automatically detect and import heroes as you browse the in-game Hero menu." },
          { icon: "🎮", title: "Twitch Overlay", desc: "Show your RTA draft picks live on stream with a real-time overlay." },
        ].map(f => (
          <div key={f.title} style={{
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 12,
            background: "rgba(255,255,255,.03)",
            padding: "16px 14px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{f.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{f.title}</div>
            <div style={{ fontSize: 12, opacity: 0.55, lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Sign-in card */}
      <div style={{
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 12,
        background: "rgba(255,255,255,.03)",
        padding: "28px 32px",
        width: "100%",
        maxWidth: 380,
        textAlign: "center",
      }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600 }}>Get Started</h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, opacity: 0.55 }}>
          Sign in with your Google account to continue.
        </p>

        {err ? (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              border: '1px solid rgba(239,68,68,.4)',
              borderRadius: 8,
              color: '#fecaca',
              background: 'rgba(239,68,68,.08)',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              textAlign: 'left',
            }}
          >
            {err}
          </div>
        ) : null}

        <GoogleSignInButton
          onClick={signInWithGoogle}
          loading={busy}
          block
          aria-label="Sign in with Google"
        />
      </div>
    </div>
  );
}
