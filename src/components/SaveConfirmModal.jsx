import React from 'react';
import '../css/modal.css';

export default function SaveConfirmModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="e7-modal__backdrop" role="dialog" aria-modal="true">
      <div className="e7-modal">
        <h3 className="e7-modal__title">Profile saved</h3>
        <p className="e7-modal__body">
          Your profile has been updated successfully.
        </p>
        <div className="e7-modal__actions">
          <button className="e7-btn-primary" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}
