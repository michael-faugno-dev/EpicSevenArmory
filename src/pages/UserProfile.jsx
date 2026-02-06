// UserProfile.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import WelcomeModal from '../components/WelcomeModal';
import SaveConfirmModal from '../components/SaveConfirmModal';

const API_BASE = 'http://localhost:5000';               // your local API (profile save/load)
const LINK_HOST = 'https://epicsevenarmoryserver-1.onrender.com'; // Render (Twitch link flow)

// Try Electron shell.openExternal; fall back to window.open.
function openExternal(url) {
  try {
    const electron = window.require ? window.require('electron') : null;
    if (electron?.shell?.openExternal) {
      electron.shell.openExternal(url);
      return;
    }
  } catch (_) {}
  window.open(url, '_blank', 'noopener,noreferrer');
}

function randomLinkCode(len = 24) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += a[(Math.random() * a.length) | 0];
  return s;
}

const cardStyle = {
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 10,
  background: 'rgba(255,255,255,.03)',
  padding: 12,
  maxWidth: 720,
};

export default function UserProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const [showWelcome, setShowWelcome] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const ranks = [
    'Bronze', 'Silver', 'Gold', 'Master',
    'Challenger', 'Champion', 'Emperor', 'Legend'
  ];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const username = localStorage.getItem('username') || '';

  const [formData, setFormData] = useState({
    username,
    epic_seven_account: '',
    streamer_name: '',
    rta_rank: '',
  });

  // ---- Twitch link state ----
  const [twitchLink, setTwitchLink] = useState(null); // { user_id, login }
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [activeLinkCode, setActiveLinkCode] = useState('');

  // Load profile (and any existing twitch link)
  useEffect(() => {
    let mounted = true;
    (async () => {
      setErr('');
      try {
        const u = encodeURIComponent(username);
        const res = await fetch(`${API_BASE}/profile?username=${u}`);
        if (res.ok) {
          const body = await res.json();
          if (body?.success && body?.profile && mounted) {
            const p = body.profile;
            setFormData({
              username: p.username || username,
              epic_seven_account: p.epic_seven_account || '',
              streamer_name: p.streamer_name || '',
              rta_rank: p.rta_rank || '',
            });
            const link = p?.links?.twitch;
            if (link && (link.user_id || link.login)) {
              setTwitchLink({ user_id: link.user_id || '', login: (link.login || '').toLowerCase() });
            } else if (p?.twitch_login) {
              setTwitchLink({ user_id: p.twitch_user_id || '', login: (p.twitch_login || '').toLowerCase() });
            }
          }
        } else {
          // fallback to local cache
          setFormData(s => ({
            ...s,
            epic_seven_account: localStorage.getItem('epic_seven_account') || '',
            streamer_name: localStorage.getItem('streamer_name') || '',
            rta_rank: localStorage.getItem('rta_rank') || '',
          }));
        }
      } catch {
        setFormData(s => ({
          ...s,
          epic_seven_account: localStorage.getItem('epic_seven_account') || '',
          streamer_name: localStorage.getItem('streamer_name') || '',
          rta_rank: localStorage.getItem('rta_rank') || '',
        }));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [username]);

  // one-time welcome modal
  useEffect(() => {
    const asked = location?.state?.showWelcome === true || sessionStorage.getItem('e7_show_welcome') === '1';
    if (asked && !sessionStorage.getItem('e7_welcome_shown')) {
      setShowWelcome(true);
      sessionStorage.setItem('e7_welcome_shown', '1');
      sessionStorage.removeItem('e7_show_welcome');
    }
  }, [location?.state]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setFormData((s) => ({ ...s, [name]: value }));
  };

  const onSave = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/update_profile`, {
        username: formData.username,
        epic_seven_account: formData.epic_seven_account,
        streamer_name: formData.streamer_name,
        straemer_name: formData.streamer_name, // legacy
        rta_rank: formData.rta_rank,
      });

      localStorage.setItem('epic_seven_account', formData.epic_seven_account);
      localStorage.setItem('streamer_name', formData.streamer_name);
      localStorage.setItem('rta_rank', formData.rta_rank);

      setMsg('Profile updated.');
      setShowSaved(true);
    } catch (e2) {
      const m = e2?.response?.data?.error || e2?.message || 'Save failed.';
      setErr(m);
    } finally {
      setSaving(false);
    }
  };

  const closeSavedAndGo = () => {
    setShowSaved(false);
    navigate('/your_units', { replace: true });
  };

  // ---- New: Begin Twitch link via Render (link_code state param) ----
  async function beginTwitchLink() {
    setLinkErr('');
    setLinkMsg('');
    if (!username) {
      setLinkErr('You must be signed in to link Twitch.');
      return;
    }

    setLinkBusy(true);
    try {
      const link_code = randomLinkCode();
      setActiveLinkCode(link_code);

      // Ask Render backend to prepare the OAuth URL and store the pending intent
      const r = await fetch(
        `${LINK_HOST}/auth/twitch/start?link_code=${encodeURIComponent(link_code)}&return_to=close`,
        { headers: { 'Username': username } }
      );
      const j = await r.json();
      if (!r.ok || !j.ok || !j.auth_url) {
        throw new Error(j.error || 'Unable to start Twitch linking.');
      }

      // Open system browser to twitch consent
      openExternal(j.auth_url);
      setLinkMsg('Browser opened. Complete the Twitch authorization…');

      // Poll until linked or timeout
      const deadline = Date.now() + 90_000; // 90s
      while (Date.now() < deadline) {
        const s = await fetch(`${LINK_HOST}/auth/link/status?link_code=${encodeURIComponent(link_code)}`, {
          cache: 'no-store',
        });
        const sj = await s.json();
        if (sj?.linked) {
          const login = (sj.twitch_login || '').toLowerCase();
          setTwitchLink({ user_id: '', login });
          setLinkMsg(`Linked as @${login}`);
          setLinkBusy(false);
          return;
        }
        if (sj?.status === 'error') {
          throw new Error('Link failed.');
        }
        await new Promise(res => setTimeout(res, 2000));
      }
      throw new Error('Timed out waiting for Twitch link.');
    } catch (e) {
      setLinkErr(e?.message || 'Link failed.');
      setLinkBusy(false);
    }
  }

  // Manual refresh (if user closed the browser and later comes back)
  async function refreshLinkStatus() {
    setLinkErr('');
    setLinkMsg('');
    if (!activeLinkCode) {
      setLinkErr('No active link attempt. Click “Link Twitch” first.');
      return;
    }
    try {
      const s = await fetch(`${LINK_HOST}/auth/link/status?link_code=${encodeURIComponent(activeLinkCode)}`, {
        cache: 'no-store',
      });
      const sj = await s.json();
      if (sj?.linked) {
        const login = (sj.twitch_login || '').toLowerCase();
        setTwitchLink({ user_id: '', login });
        setLinkMsg(`Linked as @${login}`);
      } else {
        setLinkMsg(`Status: ${sj?.status || 'pending'}. Keep this window open while you authorize in the browser.`);
      }
    } catch (e) {
      setLinkErr(e?.message || 'Could not check link status.');
    }
  }

  if (!isAuthenticated) {
    navigate('/login', { replace: true });
    return null;
  }

  if (loading) {
    return <div style={{ padding: 16 }}>Loading profile…</div>;
  }

  return (
    <div style={cardStyle}>
      <WelcomeModal open={showWelcome} onClose={() => setShowWelcome(false)} />
      <SaveConfirmModal open={showSaved} onClose={closeSavedAndGo} />

      <h2 style={{ marginTop: 0, marginBottom: 10 }}>Profile</h2>

      {err ? (
        <div
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

      {msg ? (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 12px',
            border: '1px solid rgba(34,197,94,.4)',
            borderRadius: 8,
            color: '#bbf7d0',
            background: 'rgba(34,197,94,.08)',
            fontSize: 13,
          }}
        >
          {msg}
        </div>
      ) : null}

      {/* ---------- Main Profile Form ---------- */}
      <form onSubmit={onSave} style={{ maxWidth: 560 }} autoComplete="off">
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Epic Seven Account</span>
            <input
              name="epic_seven_account"
              value={formData.epic_seven_account}
              onChange={onChange}
              className="e7-input"
              placeholder="Enter Epic Seven name"
              style={{ width: '100%' }}
              autoComplete="off"
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Twitch Username <span style={{ opacity:.7 }}>(legacy field)</span></span>
            <input
              name="streamer_name"
              value={formData.streamer_name}
              onChange={onChange}
              className="e7-input"
              placeholder="Enter Twitch name"
              style={{ width: '100%' }}
              autoComplete="off"
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>RTA rank</span>
            <select
              name="rta_rank"
              value={formData.rta_rank}
              onChange={onChange}
              className="e7-input"
              style={{ width: '100%', height: 36 }}
            >
              <option value="">Select rank…</option>
              {ranks.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              type="submit"
              disabled={saving}
              className="e7-btn-primary"
              style={{ padding: '10px 14px', borderRadius: 10 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>

      {/* ---------- Twitch Linking Section ---------- */}
      <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <h3 style={{ margin: '0 0 10px' }}>Twitch Linking</h3>

        {twitchLink ? (
          <div
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              border: '1px solid rgba(34,197,94,.35)',
              borderRadius: 8,
              color: '#bbf7d0',
              background: 'rgba(34,197,94,.06)',
              fontSize: 13,
            }}
          >
            Linked to Twitch: <strong>@{twitchLink.login || twitchLink.user_id}</strong>
          </div>
        ) : (
          <div
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              border: '1px solid rgba(249,115,22,.35)',
              borderRadius: 8,
              color: '#fed7aa',
              background: 'rgba(249,115,22,.06)',
              fontSize: 13,
            }}
          >
            Not linked. Link your Twitch to secure your overlay and data.
          </div>
        )}

        {linkErr ? (
          <div
            style={{
              marginBottom: 10,
              padding: '8px 10px',
              border: '1px solid rgba(239,68,68,.4)',
              borderRadius: 8,
              color: '#fecaca',
              background: 'rgba(239,68,68,.08)',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
            }}
          >
            {linkErr}
          </div>
        ) : null}

        {linkMsg ? (
          <div
            style={{
              marginBottom: 10,
              padding: '8px 10px',
              border: '1px solid rgba(59,130,246,.35)',
              borderRadius: 8,
              color: '#bfdbfe',
              background: 'rgba(59,130,246,.08)',
              fontSize: 12,
            }}
          >
            {linkMsg}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="e7-btn-primary"
            onClick={beginTwitchLink}
            disabled={linkBusy}
            style={{ padding: '10px 14px', borderRadius: 10 }}
          >
            {linkBusy ? 'Waiting for authorization…' : 'Link Twitch (opens browser)'}
          </button>

          <button
            type="button"
            className="e7-btn-secondary"
            onClick={refreshLinkStatus}
            disabled={linkBusy || !activeLinkCode}
            title={activeLinkCode ? `link_code: ${activeLinkCode}` : 'Start a link first'}
            style={{ padding: '10px 14px', borderRadius: 10 }}
          >
            Refresh Link Status
          </button>
        </div>
      </div>
    </div>
  );
}
