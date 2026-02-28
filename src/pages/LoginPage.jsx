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
    <div className="auth-page" style={{ maxWidth: 420, margin: '60px auto', padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>Sign Up</h1>
      <p style={{ opacity: 0.8, marginTop: 0, marginBottom: 24 }}>
        Use your Google account to continue.
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
          }}
        >
          {err}
        </div>
      ) : null}

      {/* Google-styled button (uses the CSS and component we added) */}
      <GoogleSignInButton
        onClick={signInWithGoogle}
        loading={busy}
        block
        aria-label="Sign in with Google"
      />
      {/* If you prefer the previous wording, use:
          <GoogleSignInButton onClick={signInWithGoogle} loading={busy} block>
            Continue with Google
          </GoogleSignInButton>
      */}
    </div>
  );
}
