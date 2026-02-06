import React from "react";
import { useNavigate } from "react-router-dom";

const EXT_URL =
  "https://dashboard.twitch.tv/extensions/3qerc4w2tf5cv28ka8darpwb8qqerw-0.0.1";

const OVERLAY_SETUP_KEY = "e7-overlay-setup-complete";

export default function TwitchOverlaySetup() {
  const navigate = useNavigate();

  const handleConfirm = () => {
    try {
      localStorage.setItem(OVERLAY_SETUP_KEY, "true");
    } catch {}
    navigate("/overlay/live");
  };

  return (
    <div className="container py-4 e7-content">
      <h1 className="mb-3">Twitch Overlay – Setup</h1>
      <p className="text-muted">
        Follow these steps to add and enable the Epic Seven Armory overlay on your channel.
      </p>

      <div className="card p-3 mb-3">
        <h2 className="h5 mb-2">1) Install the Extension</h2>
        <ol className="mb-2">
          <li>
            Open your extension page:&nbsp;
            <a
              href={EXT_URL}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary btn-sm"
              style={{ marginLeft: 4 }}
            >
              Open My Extension
            </a>
          </li>
          <li>
            Click <strong>Install</strong> (or <strong>Manage</strong> if already installed). You can
            also browse via{" "}
            <a
              href="https://dashboard.twitch.tv/extensions"
              target="_blank"
              rel="noreferrer"
            >
              Creator Dashboard &rsaquo; Extensions
            </a>
            .
          </li>
        </ol>
        <small className="text-muted d-block">
          Tip: You install from <em>Discovery</em> or the direct link above, then manage from
          <em> My Extensions</em>.
        </small>
      </div>

      <div className="card p-3 mb-3">
        <h2 className="h5 mb-2">2) Configure the Extension</h2>
        <ol className="mb-2">
          <li>In <strong>My Extensions</strong>, click <strong>⋯</strong> → <strong>Configure</strong>.</li>
          <li>Enter any required configuration (e.g., secret key / username) and <strong>Save</strong>.</li>
        </ol>
        <small className="text-muted d-block">
          You can return here anytime to update settings.
        </small>
      </div>

      <div className="card p-3 mb-3">
        <h2 className="h5 mb-2">3) Activate and Assign the Slot</h2>
        <ol className="mb-2">
          <li>Go to <strong>My Extensions</strong>.</li>
          <li>
            Click the <strong>Activate</strong> dropdown and choose <strong>Set as Overlay 1</strong>.
            (This overlay is designed for the video overlay slot.)
          </li>
        </ol>
        <small className="text-muted d-block">
          If you switch layouts later, re-assign the slot from the same menu.
        </small>
      </div>

      <div className="card p-3 mb-3">
        <h2 className="h5 mb-2">4) Test</h2>
        <ul className="mb-2">
          <li>Open your channel while you’re live; the overlay should appear on the video.</li>
          <li>
            If it doesn’t show, make sure it’s <strong>Activated → Overlay 1</strong> and your config
            is saved.
          </li>
        </ul>
        <div className="d-flex gap-2">
          <a
            href={EXT_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline-primary"
          >
            Open My Extension
          </a> 
          <br></br>
          <a
            href="https://dashboard.twitch.tv/extensions"
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline-secondary"
          >
            Open Extensions Manager
          </a>
        </div>
      </div>
      <br></br>
      {/* Confirm + route to your existing overlay */}
      <div className="card p-3">
        <h2 className="h6 mb-2">All set?</h2>
        <button className="btn btn-primary" onClick={handleConfirm}>
          I’ve installed & activated it — Continue
        </button>
      </div>
    </div>
  );
}
