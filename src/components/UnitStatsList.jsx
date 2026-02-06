import React, { useEffect, useMemo, useState } from 'react';

const PERCENT_FIELDS = new Set([
  'critical_hit_chance',
  'critical_hit_damage',
  'effectiveness',
  'effect_resistance',
]);

// Order/labels (add Unit Name at the top — edit mode only)
const FIELD_ORDER = [
  ['unit', 'Unit Name', 'text'],
  ['attack', 'Attack', 'number'],
  ['defense', 'Defense', 'number'],
  ['health', 'Health', 'number'],
  ['speed', 'Speed', 'number'],
  ['imprint', 'Imprint', 'text'],
  ['critical_hit_chance', 'Critical Hit Chance', 'text'],
  ['critical_hit_damage', 'Critical Hit Damage', 'text'],
  ['effectiveness', 'Effectiveness', 'text'],
  ['effect_resistance', 'Effect Resistance', 'text'],
  ['set1', 'Set 1', 'text'],
  ['set2', 'Set 2', 'text'],
  ['set3', 'Set 3', 'text'],
];

function pickValue(src, key) {
  if (src && src[key] !== undefined && src[key] !== null) return src[key];
  if (src && src.stats && typeof src.stats === 'object' && src.stats[key] !== undefined)
    return src.stats[key];
  return '';
}

// Read-only imprint formatter (unchanged)
function formatImprint(imprint) {
  if (typeof imprint === 'string' && imprint.includes('Additional')) {
    const parts = imprint.split('Additional');
    return `${parts[0]}Additional Effect`;
  }
  return imprint;
}

// If DB has 21 or "21", show "21%"; if already "21%", keep it.
function toPercentDisplay(val) {
  if (val === '' || val === null || val === undefined) return '';
  const s = String(val).trim();
  if (s.endsWith('%')) return s;
  if (/^-?\d+(\.\d+)?$/.test(s)) return `${s}%`;
  return s;
}

export default function UnitStatsList({ data, stats, editMode = false, onChange }) {
  const unitData = data || stats;
  const src = useMemo(() => (Array.isArray(unitData) ? unitData[0] : unitData) || {}, [unitData]);

  // Local draft so inputs don’t remount or lose focus
  const [draft, setDraft] = useState({});

  // Clear draft when leaving edit mode
  useEffect(() => {
    if (!editMode) setDraft({});
  }, [editMode]);

  // Initialize draft ONCE per edit session
  useEffect(() => {
    if (!editMode) return;
    if (Object.keys(draft).length > 0) return; // already initialized
    const init = {};
    for (const [key] of FIELD_ORDER) {
      const v = pickValue(src, key);
      init[key] = PERCENT_FIELDS.has(key) ? toPercentDisplay(v) : (v ?? '');
    }
    // Special: Unit Name should always reflect the resolved display name if present
    const displayName = pickValue(src, 'unit') || pickValue(src, 'name') || pickValue(src, 'unit_name');
    if (displayName) init.unit = displayName;
    setDraft(init);
  }, [src, editMode, draft]);

  const handleChange = (key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    if (typeof onChange === 'function') onChange(key, value); // keep parent in sync for saving
  };

  if (!unitData) return <div>No unit selected</div>;

  // ---------- READ-ONLY (unchanged list; Unit Name not duplicated here) ----------
  if (!editMode) {
    return (
      <ul className="list-group list-group-flush">
        <li className="list-group-item"><strong>Attack: </strong>{pickValue(src, 'attack')}</li>
        <li className="list-group-item"><strong>Defense: </strong>{pickValue(src, 'defense')}</li>
        <li className="list-group-item"><strong>Health: </strong>{pickValue(src, 'health')}</li>
        <li className="list-group-item"><strong>Speed: </strong>{pickValue(src, 'speed')}</li>
        <li className="list-group-item"><strong>Imprint: </strong>{formatImprint(pickValue(src, 'imprint'))}</li>
        <li className="list-group-item"><strong>Critical Hit Chance: </strong>{pickValue(src, 'critical_hit_chance')}</li>
        <li className="list-group-item"><strong>Critical Hit Damage: </strong>{pickValue(src, 'critical_hit_damage')}</li>
        <li className="list-group-item"><strong>Effectiveness: </strong>{pickValue(src, 'effectiveness')}</li>
        <li className="list-group-item"><strong>Effect Resistance: </strong>{pickValue(src, 'effect_resistance')}</li>
        <li className="list-group-item"><strong>Set 1: </strong>{pickValue(src, 'set1')}</li>
        <li className="list-group-item"><strong>Set 2: </strong>{pickValue(src, 'set2')}</li>
        <li className="list-group-item"><strong>Set 3: </strong>{pickValue(src, 'set3')}</li>
      </ul>
    );
  }

  // ---------- EDIT MODE (adds Unit Name row at the top) ----------
  return (
    <ul className="list-group list-group-flush unit-stats-edit">
      {FIELD_ORDER.map(([field, label, type]) => (
        <li key={field} className="list-group-item">
          <label style={{ display: 'grid', gridTemplateColumns: '160px auto', gap: 12, alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>{label}:</span>
            <input
              type={type}
              inputMode={type === 'number' ? 'decimal' : 'text'}
              step={type === 'number' ? 'any' : undefined}
              className="form-control unit-stat-input"
              value={draft[field] ?? ''}
              onChange={(e) => handleChange(field, e.target.value)}
              placeholder={
                PERCENT_FIELDS.has(field) ? 'e.g., 21 or 21%' :
                field === 'unit' ? 'Correct unit name' :
                undefined
              }
            />
          </label>
        </li>
      ))}
    </ul>
  );
}
