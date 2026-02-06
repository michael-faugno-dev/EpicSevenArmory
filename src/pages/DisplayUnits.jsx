import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import UnitStatsList from '../components/UnitStatsList';

const cardStyle = {
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 10,
  background: 'rgba(255,255,255,.03)',
  padding: 12,
};

export default function DisplayUnits() {
  const location = useLocation();
  const allStats = location.state?.stats || [];
  const [unitImages, setUnitImages] = useState({});
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);

  useEffect(() => {
    const fetchUnitImages = async () => {
      const images = {};
      for (const stat of allStats) {
        if (stat.unit) {
          try {
            const formattedUnitName = stat.unit.replaceAll(' ', '-').toLowerCase();
            const apiUrl = `https://epic7db.com/api/heroes/${formattedUnitName}/mikeyfogs`;
            const response = await axios.get(apiUrl);
            if (response.status === 200) {
              images[stat.unit] = response.data.image;
            }
          } catch (error) {
            console.error('Error fetching unit image:', error);
          }
        }
      }
      setUnitImages(images);
    };
    fetchUnitImages();
  }, [allStats]);

  if (allStats.length === 0) {
    return <div style={{ padding: 16 }}>No stats available.</div>;
  }

  const activeUnit = allStats[activeUnitIndex];

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: 10 }}>Extracted Stats</h2>

      {allStats.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {allStats.map((stat, index) => (
            <button
              key={index}
              onClick={() => setActiveUnitIndex(index)}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid rgba(148,163,184,.35)',
                background: index === activeUnitIndex ? 'rgba(37,99,235,.15)' : 'transparent',
                color: index === activeUnitIndex ? '#bfdbfe' : 'inherit',
                cursor: 'pointer',
              }}
            >
              {stat.unit}
            </button>
          ))}
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12, alignItems: 'center' }}>
          {unitImages[activeUnit.unit] ? (
            <img
              src={unitImages[activeUnit.unit]}
              alt={activeUnit.unit}
              style={{
                width: 64, height: 64, objectFit: 'cover',
                borderRadius: 10, border: '1px solid rgba(255,255,255,.08)',
                background: 'rgba(0,0,0,.2)',
              }}
            />
          ) : <div style={{ width: 64, height: 64 }} />}
          <div>
            <div style={{ fontWeight: 600 }}>{activeUnit.unit}</div>
            <div style={{ fontSize: 13, opacity: .8 }}>
              {activeUnit.unit} has been added to your profile.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <UnitStatsList stats={activeUnit} />
        </div>
      </div>
    </div>
  );
}
