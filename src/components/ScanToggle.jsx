// src/components/ScanToggle.jsx
//
// Toggle button that starts/stops the Python window monitor subprocess via
// Electron IPC. When a draft screen is detected the results are POSTed to
// /scan/result which updates selected_units so the Twitch overlay refreshes
// automatically.
import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5000';
const TOAST_DURATION_MS = 7000;

export default function ScanToggle() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(false);       // Epic Seven window found?
  const [toast, setToast] = useState('');           // latest detection result message
  const [detecting, setDetecting] = useState(false); // SIFT is running
  const [gateInfo, setGateInfo] = useState('');     // "Gate: 0.XX  1280×720"

  const cleanupStatusRef = useRef(null);
  const cleanupResultRef = useRef(null);
  const toastTimerRef    = useRef(null);

  useEffect(() => {
    return () => {
      if (cleanupStatusRef.current) cleanupStatusRef.current();
      if (cleanupResultRef.current) cleanupResultRef.current();
      if (toastTimerRef.current)    clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), TOAST_DURATION_MS);
  }, []);

  const handleMonitorStatus = useCallback((msg) => {
    if (msg.status === 'window_found') {
      setFound(true);
      if (msg.win_w && msg.win_h) {
        setGateInfo(`${msg.win_w}×${msg.win_h}`);
      }
    } else if (msg.status === 'window_minimized') {
      setFound(true); // window exists and is being captured via PrintWindow
      setGateInfo(`Minimized (${msg.win_w}×${msg.win_h})`);
    } else if (msg.status === 'gate_score') {
      setGateInfo(`Gate: ${msg.score.toFixed(2)}  ${msg.win_w}×${msg.win_h}`);
    } else if (msg.status === 'triggered') {
      setGateInfo('Detecting…');
      setDetecting(true);
    } else if (msg.status === 'window_not_found' || msg.status === 'stopped') {
      setFound(false);
      setGateInfo('');
      setDetecting(false);
    } else if (msg.status === 'detection_error') {
      showToast(`Detection error: ${msg.msg}`);
    }
  }, [showToast]);

  const handleMonitorResult = useCallback(async (data) => {
    setDetecting(false);
    const slugs = Array.isArray(data.clean) ? data.clean : [];
    if (slugs.length === 0) {
      showToast('Scan ran but found no heroes — check ROI calibration');
      return;
    }

    const token    = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    if (!token || !username) return;

    try {
      const res = await fetch(`${API_BASE}/scan/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Username': username,
        },
        body: JSON.stringify({ slugs }),
      });

      if (res.ok) {
        const data = await res.json();
        const savedNames = data.saved_names || [];
        const unmatched = data.unmatched || [];
        if (savedNames.length > 0 && unmatched.length === 0) {
          showToast(`Detected: ${savedNames.join(', ')}`);
        } else if (savedNames.length > 0) {
          showToast(`Detected: ${savedNames.join(', ')} — not in roster: ${unmatched.join(', ')}`);
        } else {
          showToast(`No roster match for: ${unmatched.join(', ')}`);
        }
      } else {
        showToast('Save failed — check units are in your roster');
      }
    } catch {
      showToast('Save failed — backend not reachable');
    }
  }, [showToast]);

  const startScanning = useCallback(async () => {
    if (!window.api?.startMonitor) {
      showToast('Monitor API not available');
      return;
    }

    const result = await window.api.startMonitor();
    if (!result?.ok) {
      showToast(result?.error || 'Failed to start monitor');
      return;
    }

    cleanupStatusRef.current = window.api.onMonitorStatus(handleMonitorStatus);
    cleanupResultRef.current = window.api.onMonitorResult(handleMonitorResult);
  }, [handleMonitorStatus, handleMonitorResult, showToast]);

  const stopScanning = useCallback(async () => {
    if (cleanupStatusRef.current) { cleanupStatusRef.current(); cleanupStatusRef.current = null; }
    if (cleanupResultRef.current) { cleanupResultRef.current(); cleanupResultRef.current = null; }

    if (window.api?.stopMonitor) {
      await window.api.stopMonitor();
    }

    setFound(false);
    setGateInfo('');
    setDetecting(false);
  }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!on) {
        setOn(true);
        await startScanning();
      } else {
        setOn(false);
        await stopScanning();
      }
    } finally {
      setBusy(false);
    }
  };

  const stateClass = on ? (found ? 'is-on ok' : 'is-on warn') : '';

  return (
    <>
      <button
        className={`scan-toggle ${stateClass}`}
        onClick={toggle}
        disabled={busy}
        title={
          on
            ? (found ? 'RTA Scan — Epic Seven window found' : 'RTA Scan — Epic Seven window not found')
            : 'Start RTA draft screen scanning'
        }
      >
        <span className={`dot ${found ? 'ok' : (on ? 'warn' : '')}`} />
        <span className="label">
          {on ? (
            <>
              RTA Scan:{' '}
              <span className="status">
                {found
                  ? <span className="status-ok">Window Found</span>
                  : <span className="status-warn">Window Not Found</span>
                }
              </span>
            </>
          ) : (
            'RTA Scan Off'
          )}
        </span>
        {on && found && gateInfo && (
          <span style={{ fontSize: 10, opacity: 0.65, marginLeft: 6 }}>{gateInfo}</span>
        )}
      </button>

      {detecting && !toast && (
        <div className="scan-toast scan-toast--detecting">
          <span className="scan-toast__pulse" /> Analyzing draft screen…
        </div>
      )}

      {toast && (
        <div className="scan-toast">
          {toast}
        </div>
      )}
    </>
  );
}
