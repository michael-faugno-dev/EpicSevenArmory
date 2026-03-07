import { useEffect, useState, useRef } from "react";

const API = "http://localhost:5000";

function useInterval(callback, delay) {
  const saved = useRef();
  useEffect(() => { saved.current = callback; }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function pillColor(type) {
  switch (type) {
    case "added":     return "#16a34a";
    case "updated":   return "#2563eb";
    case "duplicate": return "#6b7280";
    case "error":     return "#dc2626";
    default:          return "#f59e0b";
  }
}

const card = {
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 12,
  background: "rgba(255,255,255,.03)",
  padding: "20px 24px",
};

const tableCard = {
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 12,
  background: "rgba(255,255,255,.03)",
  overflow: "hidden",
};

const thStyle = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.5,
  whiteSpace: "nowrap",
  borderBottom: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.03)",
};

const tdStyle = {
  padding: "11px 16px",
  fontSize: 15,
  borderBottom: "1px solid rgba(255,255,255,.06)",
  color: "var(--text)",
};

export default function AutoImportLog() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState({});
  const username = localStorage.getItem("username") || "";

  async function fetchData() {
    try {
      const ev = await fetch(`${API}/scan_events?username=${encodeURIComponent(username)}`).then(r => r.json());
      if (ev?.ok) setEvents(ev.events);
      const st = await fetch(`${API}/monitor_status`).then(r => r.json());
      setStatus(st || {});
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => { fetchData(); }, []);
  useInterval(fetchData, status.hero_scanner_running ? 3000 : null);

  // Refresh immediately when a unit is imported (no polling delay)
  useEffect(() => {
    if (!window.api?.onUnitImportResult) return;
    const cleanup = window.api.onUnitImportResult(() => fetchData());
    return cleanup;
  }, []);

  async function exportCSV() {
    try {
      const ev = await fetch(`${API}/scan_events?username=${encodeURIComponent(username)}&all=1`).then(r => r.json());
      const all = ev?.events ?? [];
      const headers = ["Time", "Event", "Hero", "CP", "Resolution", "Raw OCR", "Note"];
      const rows = all.map(e => [
        new Date(e.ts).toLocaleString(),
        e.event_type,
        e.hero_name,
        e.cp ?? "",
        e.resolution || "",
        e.raw_ocr || "",
        e.message || "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `import-log-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // ignore
    }
  }

  async function clearLog() {
    if (!window.confirm("Delete all scan events? This cannot be undone.")) return;
    try {
      await fetch(`${API}/scan_events?username=${encodeURIComponent(username)}`, { method: "DELETE" });
      setEvents([]);
    } catch (e) {
      // ignore
    }
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 600 }}>Auto-Import Log</h1>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.65 }}>
              Scans the Hero screen and auto-adds units after ~2s on a hero.{" "}
              <strong style={{ opacity: 0.9 }}>Each account supports only one entry per hero.</strong>
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <button
              onClick={exportCSV}
              disabled={events.length === 0}
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,.2)",
                borderRadius: 8,
                color: "var(--text)",
                cursor: events.length === 0 ? "not-allowed" : "pointer",
                fontSize: 12,
                fontWeight: 600,
                opacity: events.length === 0 ? 0.35 : 1,
                padding: "6px 14px",
                transition: "opacity .15s",
              }}
            >
              Export CSV
            </button>
            <button
              onClick={clearLog}
              disabled={events.length === 0}
              style={{
                background: "none",
                border: "1px solid rgba(248,113,113,.35)",
                borderRadius: 8,
                color: "#f87171",
                cursor: events.length === 0 ? "not-allowed" : "pointer",
                fontSize: 12,
                fontWeight: 600,
                opacity: events.length === 0 ? 0.35 : 1,
                padding: "6px 14px",
                transition: "opacity .15s",
              }}
            >
              Clear Log
            </button>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              Scanner:{" "}
              <span style={{
                marginLeft: 4,
                padding: "3px 10px",
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 600,
                background: status.hero_scanner_running ? "rgba(22,163,74,.2)" : "rgba(220,38,38,.15)",
                color: status.hero_scanner_running ? "#4ade80" : "#f87171",
                border: `1px solid ${status.hero_scanner_running ? "rgba(74,222,128,.25)" : "rgba(248,113,113,.25)"}`,
              }}>
                {status.hero_scanner_running ? "Running" : "Stopped"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={tableCard}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Event</th>
                <th style={thStyle}>Hero</th>
                <th style={thStyle}>CP</th>
                <th style={thStyle}>Resolution</th>
                <th style={thStyle}>Raw OCR</th>
                <th style={thStyle}>Note</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, opacity: 0.55, fontFamily: "monospace", fontSize: 14, whiteSpace: "nowrap" }}>
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: "2px 9px",
                      borderRadius: 99,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fff",
                      background: pillColor(e.event_type),
                    }}>
                      {e.event_type}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{e.hero_name}</td>
                  <td style={{ ...tdStyle, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{e.cp ?? ""}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 14, opacity: 0.5, whiteSpace: "nowrap" }}>
                    {e.resolution || "—"}
                  </td>
                  <td
                    title={e.raw_ocr || ""}
                    style={{
                      ...tdStyle,
                      fontFamily: "monospace",
                      fontSize: 14,
                      maxWidth: 180,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: e.raw_ocr && e.hero_name !== e.raw_ocr ? "#f59e0b" : "var(--text)",
                    }}
                  >
                    {e.raw_ocr || "—"}
                  </td>
                  <td style={{ ...tdStyle, opacity: 0.6, maxWidth: 280 }}>{e.message}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: "center", padding: "48px 16px", opacity: 0.4, borderBottom: "none" }}>
                    No scan events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
