import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const OVERLAY_SETUP_KEY = 'e7-overlay-setup-complete';

export default function LeftSidebar() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    try { logout(); } catch {}
    navigate('/login', { replace: true });
  };

  // Only needed when logged in
  const overlayTarget =
    (typeof window !== 'undefined' && localStorage.getItem(OVERLAY_SETUP_KEY) === 'true')
      ? '/overlay/live'
      : '/overlay';

  return (
    <aside className="e7-sidebar">
      <div className="e7-brand">Epic Seven Armory</div>

      {isAuthenticated ? (
        <>
          <nav className="e7-nav">
            <ul className="e7-list">
              <li><NavLink to="/your_units" className="e7-link">Your Units</NavLink></li>
              <li><NavLink to="/upload" className="e7-link">Upload Unit</NavLink></li>
              <li><NavLink to="/unit_lookup" className="e7-link">Unit Look Up</NavLink></li>
              {/* Twitch Overlay visible only when logged in */}
              {/* <li><NavLink to="/upload-draft" className="e7-link">Upload Draft</NavLink></li> */}
              <li><NavLink to={overlayTarget} className="e7-link">Twitch Overlay</NavLink></li>
              {/* <li><NavLink to="/auto-import-log" className="e7-link">Import Log</NavLink></li> */}
            </ul>
          </nav>

          {/* Lower section: About + Buy Me a Coffee + Logout */}
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
                  Buy Me a Coffee
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
            Logged in: <strong>{user?.username || 'User'}</strong>
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
                  Buy Me a Coffee
                </a>
              </li>
            </ul>
          </div>
        </>
      )}
    </aside>
  );
}
