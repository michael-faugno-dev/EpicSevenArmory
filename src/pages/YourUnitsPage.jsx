import React, { useEffect, useState } from 'react';
import axios from 'axios';
import UnitStatsList from '../components/UnitStatsList';

const API_BASE = 'http://localhost:5000';

function parseJwtUsername() {
  try {
    const t = localStorage.getItem('token');
    if (!t) return '';
    const [, payload] = t.split('.');
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json?.username || '';
  } catch {
    return '';
  }
}

function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[’'`.,/()_]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveLocalHeroImage(unitName) {
  const slug = slugify(unitName);
  return slug ? `${API_BASE}/hero_image/${slug}` : '';
}

/** fallback to doc fields if needed */
function resolveDocImage(u) {
  const val = (k) => (u && typeof u[k] === 'string' ? u[k] : '');
  const urlLike =
    val('image_url') || val('img_url') || val('screenshot_url') || val('file_url') || val('public_url');
  if (urlLike && /^https?:\/\//i.test(urlLike)) return urlLike;
  const b64 = val('image_base64') || val('image_b64') || val('screenshot_b64') || val('imageData');
  if (b64) return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  return '';
}

// Editable fields (add unit)
const EDITABLE_FIELDS = [
  'unit',                     // NEW
  'attack', 'defense', 'health', 'speed',
  'imprint',
  'critical_hit_chance', 'critical_hit_damage',
  'effectiveness', 'effect_resistance',
  'set1', 'set2', 'set3',
];

// Only these are strictly numeric
const NUMERIC_FIELDS = new Set(['attack', 'defense', 'health', 'speed']);

// Percent stats that must be saved with a trailing "%"
const PERCENT_FIELDS = new Set([
  'critical_hit_chance',
  'critical_hit_damage',
  'effectiveness',
  'effect_resistance',
]);

// Free-text fields
const FREE_TEXT_FIELDS = new Set(['unit', 'imprint', 'set1', 'set2', 'set3']); // include unit

function pickEditable(u) {
  const out = {};
  // Resolve a display name for the 'unit' editor
  out.unit = u?.unit || u?.name || u?.unit_name || '';
  for (const k of EDITABLE_FIELDS) {
    if (k === 'unit') continue; // already handled
    out[k] = u?.[k] ?? (u?.stats ? u.stats[k] : '') ?? '';
  }
  return out;
}

function percentify(v) {
  if (v === '' || v === null || typeof v === 'undefined') return '';
  let s = String(v).trim();
  s = s.replace(/\s*%+$/, '%');
  if (s.endsWith('%')) return s;
  return `${s}%`;
}

function coerceTypes(updates) {
  const out = {};
  for (const [k, v] of Object.entries(updates)) {
    if (PERCENT_FIELDS.has(k)) {
      out[k] = percentify(v);
      continue;
    }
    if (NUMERIC_FIELDS.has(k)) {
      const n = v === '' || v === null || typeof v === 'undefined' ? '' : Number(v);
      out[k] = Number.isFinite(n) ? n : '';
      continue;
    }
    if (FREE_TEXT_FIELDS.has(k)) {
      out[k] = v ?? '';
      continue;
    }
    out[k] = v ?? '';
  }
  return out;
}

export default function YourUnitsPage() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [openIds, setOpenIds] = useState(() => new Set());
  const [busyId, setBusyId] = useState('');       // deleting id
  const [savingId, setSavingId] = useState('');   // saving id
  const [toast, setToast] = useState('');

  const [editIds, setEditIds] = useState(() => new Set());
  const [editMap, setEditMap] = useState({});     // id -> field map

  const username =
    localStorage.getItem('username') ||
    parseJwtUsername() ||
    '';

  // fetch units
  useEffect(() => {
    let mounted = true;

    async function fetchUnits() {
      setErr('');
      setLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/your_units`, {
          params: { username },
          headers: { username },
        });

        let list = [];
        if (Array.isArray(res.data)) list = res.data;
        else if (Array.isArray(res.data?.units)) list = res.data.units;
        else if (res.data?.data && Array.isArray(res.data.data)) list = res.data.data;

        if (!Array.isArray(list)) list = [];
        if (mounted) setUnits(list);
      } catch (e) {
        const status = e?.response?.status;
        if (status === 404) {
          if (mounted) setUnits([]);
        } else {
          console.error('[YourUnits] fetch error:', e);
          if (mounted) setErr(e?.message || 'Failed to load units');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchUnits();
    return () => { mounted = false; };
  }, [username]);

  const toggleOpen = (id) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  function startEdit(u, id) {
    const fields = pickEditable(u);
    setEditIds(prev => new Set(prev).add(id));
    setEditMap(prev => ({ ...prev, [id]: fields }));
  }

  function cancelEdit(id) {
    setEditIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setEditMap(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  function handleFieldChange(id, field, value) {
    setEditMap(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value }
    }));
  }

  async function saveEdits(u, id) {
    const updatesRaw = editMap[id] || {};
    const updates = coerceTypes(updatesRaw);

    setSavingId(id);
    setErr('');
    try {
      const tryPost = async (url) =>
        axios.post(url, { unit_id: id, updates }, { headers: { username } });

      let res;
      try {
        res = await tryPost(`${API_BASE}/update_unit_stats`);
      } catch (e) {
        if (e?.response?.status === 404) {
          res = await tryPost(`${API_BASE}/update_unit`);
        } else {
          throw e;
        }
      }

      if (res.status >= 200 && res.status < 300) {
        setUnits(prev => prev.map(x => {
          const xid = String(x._id || x.id || '');
          if (xid !== id) return x;
          const merged = { ...x, ...updates };
          if (x.stats && typeof x.stats === 'object') {
            merged.stats = { ...x.stats, ...updates };
          }
          return merged;
        }));
        cancelEdit(id);
        setToast(`${updates.unit || u.unit || u.name || 'Unit'} updated.`);
        setTimeout(() => setToast(''), 2500);
      } else {
        const msg = res?.data?.error || 'Update failed.';
        setErr(msg);
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Update failed.';
      setErr(msg);
    } finally {
      setSavingId('');
    }
  }

  async function deleteUnit(u) {
    const id = String(u._id || u.id || '');
    if (!id) return;

    const unitName = u.unit || u.name || u.unit_name || 'this unit';
    const ok = window.confirm(`Delete ${unitName} from your profile? This cannot be undone.`);
    if (!ok) return;

    setBusyId(id);
    setErr('');
    try {
      const res = await axios.post(
        `${API_BASE}/delete_unit`,
        { unit_to_delete: id },
        { headers: { username } }
      );

      if (res.status === 200) {
        setUnits(prev => prev.filter(x => String(x._id || x.id) !== id));
        setOpenIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        cancelEdit(id);
        setToast(`${unitName} deleted.`);
        setTimeout(() => setToast(''), 2500);
      } else {
        const msg = res?.data?.error || 'Delete failed.';
        setErr(msg);
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Delete failed.';
      setErr(msg);
    } finally {
      setBusyId('');
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading your units…</div>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Your Units</h2>
      <div style={{ opacity: .7, fontSize: 13, marginBottom: 8 }}>
        Showing units for <strong>{username || '(unknown user)'}</strong>
      </div>

      {toast ? (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 10px',
            border: '1px solid rgba(34,197,94,.4)',
            borderRadius: 8,
            color: '#bbf7d0',
            background: 'rgba(34,197,94,.08)',
            fontSize: 13,
          }}
        >
          {toast}
        </div>
      ) : null}

      {err ? (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 12px',
            border: '1px solid rgba(239,68,68,.4)',
            borderRadius: 8,
            color: '#fecaca',
            background: 'rgba(239,68,68,.08)',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
          }}
        >
          {err}
        </div>
      ) : null}

      {units.length === 0 ? (
        <div style={{ opacity: .85 }}>
          No units found. If you just uploaded, confirm the document’s
          <code> uploaded_by</code> matches <code>{username}</code>.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {units.map((u, i) => {
            const id = String(u._id || u.id || i);
            const unitName = u.unit || u.name || u.unit_name || 'Unknown Unit';
            const cp = u.cp ?? u.power ?? u.combat_power ?? '—';
            const gear = [u.set1, u.set2, u.set3].filter(Boolean).join(' + ') || u.gear_set || '—';
            const uploader = u.uploaded_by ?? u.owner ?? u.username ?? '—';
            const open = openIds.has(id);
            const editing = editIds.has(id);

            let imgSrc = resolveLocalHeroImage(unitName);
            const docImg = resolveDocImage(u);
            if (!imgSrc && docImg) imgSrc = docImg;
            const hasImage = !!imgSrc;

            return (
              <div
                key={id}
                style={{
                  border: '1px solid rgba(255,255,255,.08)',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,.03)',
                }}
              >
                <button
                  onClick={() => toggleOpen(id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    border: 'none',
                    background: 'transparent',
                    color: 'inherit',
                    display: 'grid',
                    gridTemplateColumns: hasImage ? '64px 1fr auto' : '1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                  aria-expanded={open ? 'true' : 'false'}
                >
                  {hasImage ? (
                    <img
                      src={imgSrc}
                      alt={unitName}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      style={{
                        width: 64,
                        height: 64,
                        objectFit: 'cover',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,.08)',
                        background: 'rgba(0,0,0,.2)',
                      }}
                    />
                  ) : null}

                  <div>
                    <div style={{ fontWeight: 600 }}>{unitName}</div>
                    <div style={{ fontSize: 13, opacity: .8 }}>
                      CP: {cp} | Gear: {gear} | Uploaded by: {uploader}
                    </div>
                  </div>

                  <div style={{ opacity: 0.7, fontSize: 18 }}>
                    {open ? '▾' : '▸'}
                  </div>
                </button>

                {open ? (
                  <div style={{ padding: '0 12px 12px' }}>
                    <UnitStatsList
                      data={editing ? editMap[id] : u}
                      editMode={editing}
                      onChange={(field, value) => handleFieldChange(id, field, value)}
                    />

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                      {!editing ? (
                        <>
                          <button
                            onClick={() => startEdit(u, id)}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid rgba(37,99,235,.45)',
                              background: 'rgba(37,99,235,.10)',
                              color: '#bfdbfe',
                              cursor: 'pointer',
                            }}
                            title="Edit this unit’s stats"
                          >
                            Edit stats
                          </button>
                          <button
                            onClick={() => deleteUnit(u)}
                            disabled={busyId === id}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid rgba(239,68,68,.45)',
                              background: 'rgba(239,68,68,.1)',
                              color: '#fecaca',
                              cursor: busyId === id ? 'not-allowed' : 'pointer',
                            }}
                            title="Remove this unit from your profile"
                          >
                            {busyId === id ? 'Deleting…' : 'Delete from Profile'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => cancelEdit(id)}
                            disabled={savingId === id}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid rgba(148,163,184,.4)',
                              background: 'rgba(148,163,184,.08)',
                              color: '#e5e7eb',
                              cursor: savingId === id ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEdits(u, id)}
                            disabled={savingId === id}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid rgba(34,197,94,.45)',
                              background: 'rgba(34,197,94,.12)',
                              color: '#bbf7d0',
                              cursor: savingId === id ? 'not-allowed' : 'pointer',
                            }}
                            title="Save changes to this unit"
                          >
                            {savingId === id ? 'Saving…' : 'Save'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
