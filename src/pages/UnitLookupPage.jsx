import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const cardStyle = {
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 10,
  background: 'rgba(255,255,255,.03)',
  padding: 12,
};

export default function UnitLookupPage() {
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/get_unit_names`);
        const list = Array.isArray(res.data) ? res.data : [];
        const unique = [...new Set(list)].sort((a, b) =>
          String(a).localeCompare(String(b))
        );
        if (mounted) setUnits(unique);
      } catch (e) {
        if (mounted) setErr(e?.message || "Failed to load units");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    if (!selectedUnit) return;
    navigate(`/unit_details/${encodeURIComponent(selectedUnit)}`);
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: 10 }}>Unit Lookup</h2>

      {loading ? (
        <div style={{ padding: 16 }}>Loading unit list…</div>
      ) : err ? (
        <div
          style={{
            marginBottom: 16, padding: '10px 12px',
            border: '1px solid rgba(239,68,68,.4)',
            borderRadius: 8, color: '#fecaca',
            background: 'rgba(239,68,68,.08)', fontSize: 13,
            whiteSpace: 'pre-wrap'
          }}
        >
          {err}
        </div>
      ) : (
        <form onSubmit={onSubmit} style={cardStyle}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Unit</span>
            <select
              className="e7-input"
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              style={{ width: '100%', height: 36 }}
            >
              <option value="">Select a unit</option>
              {units.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <div style={{ marginTop: 12 }}>
            <button type="submit" className="e7-btn-primary" disabled={!selectedUnit}>
              Search
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
