import React from "react";

export default function GoogleSignInButton({
  onClick,
  block = false,
  loading = false,
  children = "Sign in with Google",
  ...rest
}) {
  return (
    <button
      type="button"
      className={`google-btn ${block ? "google-btn--block" : ""}`}
      onClick={onClick}
      disabled={loading}
      {...rest}
    >
      {/* Google "G" as inline SVG to avoid external assets */}
      <span className="google-btn__icon" aria-hidden="true">
        <svg viewBox="0 0 18 18" width="18" height="18">
          <g>
            <path fill="#EA4335" d="M17.64 9.204c0-.639-.057-1.252-.163-1.839H9v3.478h4.844a4.14 4.14 0 01-1.797 2.714v2.257h2.905c1.7-1.566 2.688-3.872 2.688-6.61z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.186l-2.905-2.257c-.806.54-1.838.862-3.051.862-2.346 0-4.333-1.583-5.04-3.71H.954v2.33A9 9 0 009 18z"/>
            <path fill="#4A90E2" d="M3.96 10.709A5.4 5.4 0 013.68 9c0-.594.102-1.17.28-1.709V4.961H.954A9 9 0 000 9c0 1.454.348 2.83.954 4.039l3.006-2.33z"/>
            <path fill="#FBBC05" d="M9 3.58c1.322 0 2.51.455 3.444 1.348l2.583-2.583C13.464.9 11.43 0 9 0A9 9 0 00.954 4.961l3.006 2.33C4.667 5.164 6.654 3.58 9 3.58z"/>
          </g>
        </svg>
      </span>

      {!loading ? (
        <span>{children}</span>
      ) : (
        <span className="google-btn__spinner" aria-label="Signing in…" />
      )}
    </button>
  );
}
