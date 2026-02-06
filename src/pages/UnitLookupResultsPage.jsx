import React, { useState, useEffect } from "react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";

const cardStyle = {
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 10,
  background: 'rgba(255,255,255,.03)',
  padding: 12,
};

function toE7Slug(rawName) {
  if (rawName === "Ainos 2.0") return "ainos-20";
  return rawName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function hasEntries(obj) {
  return obj && typeof obj === "object" && Object.keys(obj).length > 0;
}

export default function UnitLookupResultsPage() {
  const { unitName = "" } = useParams();
  const navigate = useNavigate();

  const [unit, setUnit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const rawName = decodeURIComponent(unitName);
        const slug = toE7Slug(rawName);
        const apiUrl = `https://epic7db.com/api/heroes/${slug}/mikeyfogs`;
        const res = await axios.get(apiUrl);
        if (!mounted) return;
        setUnit(res.data);
      } catch (e) {
        if (!mounted) return;
        setErr(e?.response?.data?.error || e?.message || "Failed to load unit");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [unitName]);

  const element = unit?.element ?? unit?.attribute ?? null;
  const klass = unit?.class ?? unit?.classType ?? unit?.role ?? null;
  const zodiac = unit?.zodiac ?? null;
  const rarity = unit?.rarity ?? unit?.stars ?? null;
  const stats = unit?.stats ?? unit?.baseStats ?? null;
  const memoryImprints = unit?.memory_imprints ?? unit?.memoryImprints ?? null;
  const imprintRelease = memoryImprints?.imprint_release ?? null;
  const imprintConcentration = memoryImprints?.imprint_concentration ?? null;
  const unitImage =
    (unit && unit.assets && (unit.assets.image || unit.assets.icon || unit.assets.thumbnail)) ||
    unit?.image || unit?.icon || unit?.thumbnail || null;

  if (loading) {
    return (
      <div>
        <button className="btn btn-link mb-3" onClick={() => navigate("/unit_lookup")}>
          ← Back to Lookup
        </button>
        <div style={{ padding: 16 }}>Loading…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div>
        <button className="btn btn-link mb-3" onClick={() => navigate("/unit_lookup")}>
          ← Back to Lookup
        </button>
        <div
          style={{
            marginBottom: 16, padding: '10px 12px',
            border: '1px solid rgba(239,68,68,.4)',
            borderRadius: 8, color: '#fecaca',
            background: 'rgba(239,68,68,.08)', fontSize: 13
          }}
        >
          {err}
        </div>
      </div>
    );
  }

  if (!unit) {
    return (
      <div>
        <button className="btn btn-link mb-3" onClick={() => navigate("/unit_lookup")}>
          ← Back to Lookup
        </button>
        <div className="alert alert-warning">No data for this unit.</div>
      </div>
    );
  }

  return (
    <div>
      <button className="btn btn-link mb-3" onClick={() => navigate("/unit_lookup")}>
        ← Back to Lookup
      </button>

      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: unitImage ? '96px 1fr' : '1fr', gap: 12 }}>
          {unitImage ? (
            <img
              src={unitImage}
              alt={`${unit.name} Image`}
              style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 12,
                       border: '1px solid rgba(255,255,255,.08)', background: 'rgba(0,0,0,.2)' }}
            />
          ) : null}
          <div>
            <h2 style={{ margin: 0 }}>{unit.name}</h2>
            {(element || klass || zodiac || rarity) && (
              <div style={{ fontSize: 13, opacity: .8, marginTop: 2 }}>
                {element ? `Element: ${element}` : ''}{element && (klass || zodiac || rarity) ? ' • ' : ''}
                {klass ? `Class: ${klass}` : ''}{klass && (zodiac || rarity) ? ' • ' : ''}
                {zodiac ? `Zodiac: ${zodiac}` : ''}{zodiac && rarity ? ' • ' : ''}
                {rarity ? `Rarity: ${rarity}★` : ''}
              </div>
            )}
          </div>
        </div>

        {stats && (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ margin: '0 0 6px 0' }}>Base Stats</h3>
            <ul className="list-group list-group-flush">
              {typeof stats.attack !== "undefined" && (
                <li className="list-group-item"><strong>Attack:</strong> {stats.attack}</li>
              )}
              {typeof stats.health !== "undefined" && (
                <li className="list-group-item"><strong>Health:</strong> {stats.health}</li>
              )}
              {typeof stats.defense !== "undefined" && (
                <li className="list-group-item"><strong>Defense:</strong> {stats.defense}</li>
              )}
              {typeof stats.speed !== "undefined" && (
                <li className="list-group-item"><strong>Speed:</strong> {stats.speed}</li>
              )}
            </ul>
          </div>
        )}

        {(imprintRelease || imprintConcentration) && (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ margin: '0 0 6px 0' }}>Memory Imprints</h3>
            <div className="row">
              {imprintRelease && (
                <div className="col-md-6">
                  <h4 className="h6">Imprint Release</h4>
                  <ul className="list-group list-group-flush">
                    {Object.entries(imprintRelease).map(([k, v]) => (
                      <li key={k} className="list-group-item"><strong>{k}:</strong> {String(v)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {imprintConcentration && (
                <div className="col-md-6">
                  <h4 className="h6">Imprint Concentration</h4>
                  <ul className="list-group list-group-flush">
                    {Object.entries(imprintConcentration).map(([k, v]) => (
                      <li key={k} className="list-group-item"><strong>{k}:</strong> {String(v)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: '0 0 6px 0' }}>Skills</h3>
          {Array.isArray(unit.skills) && unit.skills.length > 0 ? (
            <ul className="list-group list-group-flush">
              {unit.skills.map((s, i) => (
                <li key={s.name || i} className="list-group-item">
                  <strong>{s.name || "Unnamed Skill"}</strong>{s.description ? `: ${s.description}` : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-muted">No skills listed.</div>
          )}
        </div>
      </div>
    </div>
  );
}
