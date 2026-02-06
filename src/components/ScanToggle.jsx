// src/components/ScanToggle.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5000';
const LOOP_INTERVAL_MS = 600; // capture cadence while ON (tweak 300–1000ms)

export default function ScanToggle() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(false);           // Epic Seven window found? (i.e., capture succeeded)
  const [detected, setDetected] = useState(null);      // latest matcher results (array) or null
  const [msg, setMsg] = useState('');                  // tiny status hint

  const loopRef = useRef(null);                        // interval id
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
      loopRef.current = null;
      stopRequestedRef.current = true;
    };
  }, []);

  const stepOnce = useCallback(async () => {
    if (!window.api || typeof window.api.captureEpicSevenOnce !== 'function') {
      setFound(false);
      setMsg('Missing captureEpicSevenOnce API');
      return;
    }

    let blob;
    try {
      blob = await window.api.captureEpicSevenOnce(); // window→screen+crop fallback is inside
      setFound(true);
      setMsg('');
    } catch (e) {
      setFound(false);
      setDetected(null);
      setMsg(String(e?.message || e || 'Capture failed'));
      return;
    }

    try {
      const form = new FormData();
      form.append('screen', blob, 'frame.png');

      const res = await fetch(`${API_BASE}/detect-once`, {
        method: 'POST',
        body: form
      });

      if (!res.ok) {
        setMsg(`detect-once ${res.status}`);
        return;
      }

      const data = await res.json();
      const results = Array.isArray(data?.results) ? data.results : data?.results?.results;

      if (Array.isArray(results)) {
        setDetected(results);

        const fourClean = results.filter(r => r && !r.banned && r.best).slice(0, 4);
        if (fourClean.length === 4) {
          setMsg(`Matched 4: ${fourClean.map(r => r.best).join(', ')}`);
        } else {
          setMsg('Scanning…');
        }
      } else {
        setDetected(null);
        setMsg('No results');
      }
    } catch (e) {
      setMsg('detect-once failed');
    }
  }, []);

  const startLoop = useCallback(() => {
    stopRequestedRef.current = false;
    if (loopRef.current) clearInterval(loopRef.current);
    void stepOnce(); // immediate kick
    loopRef.current = setInterval(() => {
      if (stopRequestedRef.current) return;
      void stepOnce();
    }, LOOP_INTERVAL_MS);
  }, [stepOnce]);

  const stopLoop = useCallback(() => {
    stopRequestedRef.current = true;
    if (loopRef.current) clearInterval(loopRef.current);
    loopRef.current = null;
    setFound(false);
    setMsg('');
  }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!on) {
        setOn(true);
        startLoop();
      } else {
        setOn(false);
        stopLoop();
      }
    } finally {
      setBusy(false);
    }
  };

  const stateClass = on ? (found ? 'is-on ok' : 'is-on warn') : '';

  return (
    <button
      className={`scan-toggle ${stateClass}`}
      onClick={toggle}
      disabled={busy}
      title={
        on
          ? (found ? 'Scanning Epic Seven window (found)' : 'Scanning Epic Seven window (not found)')
          : 'Start scanning Epic Seven window'
      }
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}
    >
      <span className={`dot ${found ? 'ok' : (on ? 'warn' : '')}`} />
      <span className="label">
        {on ? (
          <>
            Scanning:{' '}
            <span className="status">
              {found ? (
                <span className="status-ok">Window Found</span>
              ) : (
                <span className="status-warn">Window Not Found</span>
              )}
            </span>
          </>
        ) : (
          'Scan Off'
        )}
      </span>
      {on && (
        <span className="hint" style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>
          {msg}
        </span>
      )}
    </button>
  );
}
