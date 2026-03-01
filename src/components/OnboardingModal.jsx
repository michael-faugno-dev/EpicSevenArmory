import { useState } from 'react';

const STORAGE_KEY = 'e7a_onboarded';

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,.72)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
};

const modal = {
  background: '#1a1a2e',
  border: '1px solid rgba(145,100,230,.3)',
  borderRadius: 14,
  padding: '28px 32px',
  maxWidth: 560,
  width: '90%',
};

const card = {
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8,
  background: 'rgba(255,255,255,.03)',
  padding: '12px 14px',
  marginBottom: 10,
};

const badge = {
  display: 'inline-block',
  background: 'rgba(145,100,230,.25)',
  color: '#c9a0ff',
  borderRadius: 6,
  padding: '2px 8px',
  fontSize: 11,
  fontWeight: 700,
  marginBottom: 4,
};

export default function OnboardingModal() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY));

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  return (
    <div style={overlay} onClick={dismiss}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Welcome to Epic Seven Armory</h2>
        <p style={{ opacity: 0.65, fontSize: 13, marginBottom: 18 }}>
          Here's a quick overview of what the app can do.
        </p>

        <div style={card}>
          <div style={badge}>HERO IMPORT</div>
          <p style={{ margin: 0, fontSize: 13 }}>
            Turn on <strong>Hero Import</strong> in the header, then browse to any hero's stat screen
            in-game. Hold it for ~2 seconds and the stats are automatically saved to your roster.
          </p>
        </div>

        <div style={card}>
          <div style={badge}>RTA SCAN</div>
          <p style={{ margin: 0, fontSize: 13 }}>
            Turn on <strong>RTA Scan</strong> and queue into an RTA match. The app detects your draft
            picks and instantly updates your Twitch overlay — no input needed.
          </p>
        </div>

        <div style={card}>
          <div style={{ ...badge, marginBottom: 4 }}>TWITCH OVERLAY</div>
          <p style={{ margin: 0, fontSize: 13 }}>
            Install the <strong>Epic Seven Armory</strong> Twitch extension and follow the setup
            guide under <em>Twitch Overlay Setup</em> in the sidebar to go live with unit stats on
            your stream.
          </p>
        </div>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="e7-btn-primary" onClick={dismiss}>
            Got it — let's go
          </button>
        </div>
      </div>
    </div>
  );
}
