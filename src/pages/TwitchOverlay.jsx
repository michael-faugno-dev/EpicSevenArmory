// TwitchOverlay.jsx
// Setup page for the Twitch stream overlay. Lets users pick up to 4 of their
// uploaded heroes to display on stream. The selected units are persisted to
// MongoDB via /update_selected_units so the Twitch extension panel can read them.
//
// Hero portrait images are fetched through the backend proxy (/hero_image/<slug>)
// which keeps the API credentials server-side rather than exposing them in the browser.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSidebar } from '../context/SidebarContext';
import "../css/TwitchOverlay.css";
import { API_BASE, getAuthHeaders } from '../api/client';

const TwitchOverlay = () => {
  const { selectedUnits, setSelectedUnits, tabImages, setTabImages } = useSidebar();
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState(null);
  const [possibleUnits, setPossibleUnits] = useState([]);
  const navigate = useNavigate();
  const username = localStorage.getItem('username');

  useEffect(() => {
    if (!username) {
      navigate('/login');
      return;
    }
    fetchPossibleUnits();
    fetchSelectedUnits();
  }, [username, navigate]);

  const handleBack = () => {
    navigate('/overlay')
  }

  const fetchPossibleUnits = async () => {
    try {
      const response = await fetch(`${API_BASE}/your_units`, {
        method: 'GET',
        headers: {
          'Username': username,
          ...getAuthHeaders(),
        }
      });
      if (response.ok) {
        const data = await response.json();
        setPossibleUnits(data);
      } else if (response.status === 404) {
        console.log("No units found for this user");
      }
    } catch (error) {
      console.error('Error fetching possible units:', error);
    }
  };

  const fetchSelectedUnits = async () => {
    try {
      const response = await fetch(`${API_BASE}/get_selected_units_data`, {
        method: 'GET',
        headers: {
          'Username': username,
          ...getAuthHeaders(),
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedUnits(data);
        if (data.length > 0) {
          setActiveTab(data[0].unit);
          data.forEach(unit => fetchUnitImage(unit.unit));
        }
      }
    } catch (error) {
      console.error('Error fetching selected units:', error);
    }
  };

  const fetchUnitImage = (unitName) => {
    const slug = unitName.replace(/ /g, '-').toLowerCase();
    setTabImages(prevImages => ({ ...prevImages, [unitName]: `${API_BASE}/hero_image/${slug}` }));
  };

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const handleTabClick = (unitName) => {
    setActiveTab(unitName);
  };

  const untoggleAll = async () => {
    setSelectedUnits([]);
  
    try {
      await fetch(`${API_BASE}/update_selected_units`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Username': username,
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ units: [] })
      });
    } catch (error) {
      console.error('Error clearing selected units:', error);
    }
  
    setActiveTab(null);
  };

  const handleUnitSelection = async (unit) => {
    const isSelected = selectedUnits.some(u => u._id === unit._id);
    const updatedSelectedUnits = isSelected
      ? selectedUnits.filter(u => u._id !== unit._id)
      : [...selectedUnits, unit].slice(0, 4);

    setSelectedUnits(updatedSelectedUnits);

    try {
      await fetch(`${API_BASE}/update_selected_units`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Username': username,
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ units: updatedSelectedUnits.map(u => ({ id: u._id })) })
      });
    } catch (error) {
      console.error('Error updating selected units:', error);
    }

    if (!tabImages[unit.unit]) {
      fetchUnitImage(unit.unit);
    }
  };

  if (!username) {
    return <div>Please log in to view this page.</div>;
  }

  return (
    <>
    <div className='twitch-info'>
    <h3>This sidebar will display on your twitch.tv stream. Use the checkboxes to select the units to display. The next update will do this automatically.</h3>
    </div>
      <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        <div className="toggle-button" onClick={toggleSidebar}>
          {isOpen ? '<<' : '>>'}
        </div>
        {isOpen && (
          <>
            <div className="tabs">
              {[0, 1, 2, 3].map((index) => (
                <button
                  key={index}
                  className={`tab-button ${selectedUnits[index] && activeTab === selectedUnits[index].unit ? 'active' : ''} ${selectedUnits[index] ? 'filled' : 'empty'}`}
                  onClick={() => selectedUnits[index] && handleTabClick(selectedUnits[index].unit)}
                  style={selectedUnits[index] && tabImages[selectedUnits[index].unit] ? { backgroundImage: `url(${tabImages[selectedUnits[index].unit]})` } : {}}
                >
                  {selectedUnits[index] && !tabImages[selectedUnits[index].unit] && selectedUnits[index].unit}
                </button>
              ))}
            </div>
            <div className="content">
              {selectedUnits.map((unit, index) =>
                activeTab === unit.unit ? (
                  <div key={index} className="unit">
                    <h2>{unit.unit}</h2>
                    <p>Attack: {unit.attack}</p>
                    <p>Defense: {unit.defense}</p>
                    <p>Health: {unit.health}</p>
                    <p>Speed: {unit.speed}</p>
                    <p>Critical Hit Chance: {unit.critical_hit_chance}</p>
                    <p>Critical Hit Damage: {unit.critical_hit_damage}</p>
                    <p>Effectiveness: {unit.effectiveness}</p>
                    <p>Effect Resistance: {unit.effect_resistance}</p>
                    {unit.set1 && <p>Set: {unit.set1}</p>}
                    {unit.set2 && <p>Set: {unit.set2}</p>}
                    {unit.set3 && <p>Set: {unit.set3}</p>}
                  </div>
                ) : null
              )}
            </div>
          </>
        )}
      </div>
      <div id="unit-selector-container">
        <h3>Select the units you want to display on stream (max 4):</h3>
        <button onClick={untoggleAll}>Deselect All Units</button>
        <div id="unit-selector">
          {possibleUnits.map((unit) => (
            <div className="checkbox" key={unit._id}>
              <input
                type="checkbox"
                id={`unit-${unit._id}`}
                name="unit"
                value={unit.unit}
                checked={selectedUnits.some(u => u._id === unit._id)}
                onChange={() => handleUnitSelection(unit)}
              />
              <label htmlFor={`unit-${unit._id}`}>{unit.unit}</label>
            </div>
          ))}
          <br></br>
        </div>
      </div>
      <div>
          <button id="back-button" onClick={handleBack}>Back to Setup Instructions</button>
        </div>
    </>
  );
};

export default TwitchOverlay;