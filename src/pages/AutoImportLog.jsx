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
    case "added": return "#16a34a";      // green
    case "updated": return "#2563eb";    // blue
    case "duplicate": return "#6b7280";  // gray
    case "error": return "#dc2626";      // red
    default: return "#f59e0b";           // orange
  }
}

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

  function exportCSV() {
    const headers = ["Time", "Event", "Hero", "CP", "Resolution", "Raw OCR", "Note"];
    const rows = events.map(e => [
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
  }

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl p-4 shadow bg-white dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Auto-Import Log</h1>
            <p className="text-sm opacity-80">
              Scans the Hero screen and auto-adds units after ~2s on a hero.
              <strong> For now, each account supports only one instance per hero.</strong>
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={exportCSV}
              disabled={events.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Export CSV
            </button>
            <span>
              Scanner:{" "}
              <span
                className="px-2 py-1 rounded-full"
                style={{
                  background: status.hero_scanner_running ? "#dcfce7" : "#fee2e2",
                  color: status.hero_scanner_running ? "#166534" : "#991b1b",
                }}
              >
                {status.hero_scanner_running ? "Running" : "Stopped"}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl shadow bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 bg-zinc-50 dark:bg-zinc-800/60 text-xs uppercase tracking-wide opacity-60">
                <th className="py-3 px-4 text-left whitespace-nowrap">Time</th>
                <th className="py-3 px-4 text-left">Event</th>
                <th className="py-3 px-4 text-left">Hero</th>
                <th className="py-3 px-4 text-left">CP</th>
                <th className="py-3 px-4 text-left whitespace-nowrap">Resolution</th>
                <th className="py-3 px-4 text-left">Raw OCR</th>
                <th className="py-3 px-4 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr
                  key={i}
                  className="border-b border-zinc-200/20 hover:bg-zinc-100/40 dark:hover:bg-zinc-800/40 transition-colors"
                >
                  <td className="py-3 px-4 whitespace-nowrap text-xs opacity-70">{new Date(e.ts).toLocaleString()}</td>
                  <td className="py-3 px-4">
                    <span
                      className="px-2 py-0.5 rounded-full text-white text-xs font-medium"
                      style={{ background: pillColor(e.event_type) }}
                    >
                      {e.event_type}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium">{e.hero_name}</td>
                  <td className="py-3 px-4 tabular-nums opacity-80">{e.cp ?? ""}</td>
                  <td className="py-3 px-4 whitespace-nowrap font-mono text-xs opacity-60">{e.resolution || "—"}</td>
                  <td
                    className="py-3 px-4 font-mono text-xs max-w-[180px] truncate"
                    title={e.raw_ocr || ""}
                    style={{ color: e.raw_ocr && e.hero_name !== e.raw_ocr ? "#f59e0b" : "inherit" }}
                  >
                    {e.raw_ocr || "—"}
                  </td>
                  <td className="py-3 px-4 text-xs opacity-70 max-w-[280px]">{e.message}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td className="py-10 px-4 opacity-50 text-center" colSpan={7}>No scan events yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
