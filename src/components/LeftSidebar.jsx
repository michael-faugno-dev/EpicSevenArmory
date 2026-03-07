import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function LeftSidebar() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [twitchLogin, setTwitchLogin] = useState(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.username) return;
    api.get(`/profile?username=${encodeURIComponent(user.username)}`)
      .then(res => {
        const link = res.data?.profile?.links?.twitch;
        if (link?.login) setTwitchLogin(link.login.toLowerCase());
      })
      .catch(() => {});
  }, [isAuthenticated, user?.username]);

  const handleLogout = () => {
    try { logout(); } catch {}
    navigate('/login', { replace: true });
  };

  return (
    <aside className="e7-sidebar">
      <div className="e7-brand">Epic Seven Armory</div>

      {isAuthenticated ? (
        <>
          <nav className="e7-nav">
            <ul className="e7-list">
              <li><NavLink to="/your_units" className="e7-link">Your Units</NavLink></li>
              <li><NavLink to="/upload" className="e7-link">Upload Unit Screenshot</NavLink></li>
              <li><NavLink to="/unit_lookup" className="e7-link">Hero Library</NavLink></li>
              <li><NavLink to="/overlay/live" className="e7-link">Twitch Overlay</NavLink></li>
              <li><NavLink to="/auto-import-log" className="e7-link">Import Log</NavLink></li>
            </ul>
          </nav>

          {/* Bug report — separate section above lower nav */}
          <div className="e7-nav" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
            <ul className="e7-list">
              <li><NavLink to="/bug-report" className="e7-link">Report a Bug</NavLink></li>
            </ul>
          </div>

          {/* Lower section: Twitch Setup + About + Buy Me a Coffee + Logout */}
          <div className="e7-nav e7-nav--lower">
            <ul className="e7-list">
              <li><NavLink to="/overlay" className="e7-link">Twitch Overlay Setup</NavLink></li>
              <li><NavLink to="/about" className="e7-link">About</NavLink></li>
              <li>
                <a
                  className="e7-link"
                  href="https://buymeacoffee.com/michael.faugno"
                  target="_blank"
                  rel="noreferrer"
                >
                  Donate
                </a>
              </li>
              <li>
                <button className="e7-link e7-btn" onClick={handleLogout}>Log Out</button>
              </li>
            </ul>
          </div>

          <div
            className="e7-userbar"
            onClick={() => navigate('/profile')}
            title="Click for settings"
            role="button"
          >
            <div>Logged in: <strong>{user?.username || 'User'}</strong></div>
            {twitchLogin && (
              <div style={{ fontSize: '0.75em', opacity: 0.7, marginTop: '2px' }}>
                Twitch: <strong>@{twitchLogin}</strong>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <nav className="e7-nav">
            <ul className="e7-list">
              <li><NavLink to="/login" className="e7-link">Log In</NavLink></li>
              {/* HIDE Twitch Overlay when logged out */}
            </ul>
          </nav>

          {/* Lower section for logged-out state: About + Coffee */}
          <div className="e7-nav e7-nav--lower">
            <ul className="e7-list">
              <li><NavLink to="/about" className="e7-link">About</NavLink></li>
              <li>
                <a
                  className="e7-link"
                  href="https://buymeacoffee.com/michael.faugno"
                  target="_blank"
                  rel="noreferrer"
                >
                  Donate
                </a>
              </li>
            </ul>
          </div>
        </>
      )}
    </aside>
  );
}
