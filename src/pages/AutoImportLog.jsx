import React, { useEffect, useState, useRef } from "react";

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
  const username = localStorage.getItem("epic_seven_account") || "";

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
  useInterval(fetchData, 3000); // every 3s

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
          <div className="text-sm">
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
          </div>
        </div>
      </div>

      <div className="rounded-xl p-4 shadow bg-white dark:bg-zinc-900">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left opacity-70">
              <tr>
                <th className="py-2 pr-4">Time (UTC)</th>
                <th className="py-2 pr-4">Event</th>
                <th className="py-2 pr-4">Hero</th>
                <th className="py-2 pr-4">CP</th>
                <th className="py-2 pr-4">Note</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i} className="border-t border-zinc-200/40">
                  <td className="py-2 pr-4">{new Date(e.ts).toLocaleString()}</td>
                  <td className="py-2 pr-4">
                    <span className="px-2 py-1 rounded-full text-white" style={{ background: pillColor(e.event_type) }}>
                      {e.event_type}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{e.hero_name}</td>
                  <td className="py-2 pr-4">{e.cp ?? ""}</td>
                  <td className="py-2 pr-4">{e.message}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td className="py-6 opacity-70" colSpan={5}>No scan events yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
