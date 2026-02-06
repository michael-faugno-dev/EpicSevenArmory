import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSidebar } from '../context/SidebarContext';
import "../css/TwitchOverlay.css";

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
      const response = await fetch('http://localhost:5000/your_units', {
        method: 'GET',
        headers: {
          'Username': username
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
      const response = await fetch('http://localhost:5000/get_selected_units_data', {
        method: 'GET',
        headers: {
          'Username': username
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

  const fetchUnitImage = async (unitName) => {
    try {
      const response = await fetch(`https://epic7db.com/api/heroes/${unitName.replace(/ /g, '-')}/mikeyfogs`);
      const data = await response.json();
      setTabImages(prevImages => ({ ...prevImages, [unitName]: data.image }));
    } catch (error) {
      console.error('Error fetching image:', error);
    }
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
      await fetch('http://localhost:5000/update_selected_units', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Username': username
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
      await fetch('http://localhost:5000/update_selected_units', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Username': username
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