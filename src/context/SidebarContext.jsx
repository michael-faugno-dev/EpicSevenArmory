// SidebarContext.jsx
// Shared state for the Twitch overlay sidebar: which units are selected
// and their cached hero portrait image URLs. Consumed by TwitchOverlay.jsx
// and any other component that needs to read/write the active overlay units.
import React, { createContext, useState, useContext } from 'react';

const SidebarContext = createContext();

export const SidebarProvider = ({ children }) => {
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [tabImages, setTabImages] = useState({});
  const [activeTab, setActiveTab] = useState(null);

  return (
    <SidebarContext.Provider value={{ selectedUnits, setSelectedUnits, tabImages, setTabImages, activeTab, setActiveTab }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => useContext(SidebarContext);
