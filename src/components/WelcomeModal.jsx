import React from 'react';
import '../css/modal.css';

export default function WelcomeModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="e7-modal__backdrop" role="dialog" aria-modal="true">
      <div className="e7-modal">
        <h3 className="e7-modal__title">Welcome to Epic Seven Armory!</h3>
        <p className="e7-modal__body">
          Thanks for signing in. Before you start, please update your profile with your
          <strong> Epic Seven account name</strong>, <strong>Twitch Username</strong>, and <strong>RTA rank</strong>.
          This helps power features like overlays and lookups.
        </p>
        <div className="e7-modal__actions">
          <button className="e7-btn-primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
