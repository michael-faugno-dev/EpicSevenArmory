// src/components/UnitScanToggle.jsx
//
// Toggle button that starts/stops the Python unit_scanner.py subprocess via
// Electron IPC. When the scanner detects the hero stat screen for ~2 seconds,
// it captures the frame, OCRs it via /auto_import/unit, and upserts the unit
// in the user's roster. Results are shown as toasts and logged to AutoImportLog.
import { useCallback, useEffect, useRef, useState } from 'react';

const TOAST_DURATION_MS = 7000;

export default function UnitScanToggle() {
  const [on, setOn]             = useState(false);
  const [busy, setBusy]         = useState(false);
  const [found, setFound]       = useState(false);       // E7 window found?
  const [detecting, setDetecting] = useState(false);     // OCR in progress
  const [toast, setToast]       = useState('');
  const [gateInfo, setGateInfo] = useState('');

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

  const handleStatus = useCallback((msg) => {
    if (msg.status === 'window_found') {
      setFound(true);
      if (msg.win_w && msg.win_h) setGateInfo(`${msg.win_w}×${msg.win_h}`);
    } else if (msg.status === 'window_minimized') {
      setFound(true);
      setGateInfo(`Minimized (${msg.win_w}×${msg.win_h})`);
    } else if (msg.status === 'gate_score') {
      setGateInfo(`Gate: ${msg.score.toFixed(2)}  ${msg.win_w}×${msg.win_h}`);
    } else if (msg.status === 'capturing') {
      setGateInfo('Reading hero…');
      setDetecting(true);
    } else if (msg.status === 'captured') {
      setGateInfo('Importing…');
    } else if (msg.status === 'window_not_found' || msg.status === 'stopped') {
      setFound(false);
      setGateInfo('');
      setDetecting(false);
    }
  }, []);

  const handleResult = useCallback((data) => {
    setDetecting(false);
    setGateInfo(found ? '' : '');   // reset after import
    if (!data) {
      showToast('Import failed — no response from server');
      return;
    }
    if (data.ok) {
      const verb = data.event_type === 'updated' ? 'Updated' : 'Added';
      const cp   = data.cp ? ` (${data.cp} CP)` : '';
      showToast(`${verb}: ${data.hero_name}${cp}`);
    } else {
      showToast(data.error || 'Import failed — hero not recognized');
    }
  }, [showToast, found]);

  const startScanning = useCallback(async () => {
    if (!window.api?.startUnitScanner) {
      showToast('Unit scanner API not available');
      return;
    }
    const token    = localStorage.getItem('token')    || '';
    const username = localStorage.getItem('username') || '';
    const result   = await window.api.startUnitScanner(token, username);
    if (!result?.ok) {
      showToast(result?.error || 'Failed to start unit scanner');
      return;
    }
    cleanupStatusRef.current = window.api.onUnitScannerStatus(handleStatus);
    cleanupResultRef.current = window.api.onUnitImportResult(handleResult);
  }, [handleStatus, handleResult, showToast]);

  const stopScanning = useCallback(async () => {
    if (cleanupStatusRef.current) { cleanupStatusRef.current(); cleanupStatusRef.current = null; }
    if (cleanupResultRef.current) { cleanupResultRef.current(); cleanupResultRef.current = null; }
    if (window.api?.stopUnitScanner) await window.api.stopUnitScanner();
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
            ? (found ? 'Hero Import — Epic Seven window found' : 'Hero Import — Epic Seven window not found')
            : 'Start auto-importing units from hero screen'
        }
      >
        <span className={`dot ${found ? 'ok' : (on ? 'warn' : '')}`} />
        <span className="label">
          {on ? (
            <>
              Hero Import:{' '}
              <span className="status">
                {found
                  ? <span className="status-ok">Window Found</span>
                  : <span className="status-warn">Window Not Found</span>
                }
              </span>
            </>
          ) : (
            'Hero Import Off'
          )}
        </span>
        {on && found && gateInfo && (
          <span style={{ fontSize: 10, opacity: 0.65, marginLeft: 6 }}>{gateInfo}</span>
        )}
      </button>

      {detecting && !toast && (
        <div className="scan-toast scan-toast--detecting">
          <span className="scan-toast__pulse" /> Reading hero stats…
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
