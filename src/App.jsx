import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LeftSidebar from './components/LeftSidebar';
import ScanToggle from './components/ScanToggle';
import './css/layout.css';
import './css/scan-toggle.css';
import YourUnitsPage from './pages/YourUnitsPage';
import UnitLookupPage from './pages/UnitLookupPage';
import UnitLookupResultsPage from "./pages/UnitLookupResultsPage";
import UploadUnit from './pages/UploadUnit';
import DisplayUnits from './pages/DisplayUnits';
import UserProfile from './pages/UserProfile';
import TwitchOverlay from './pages/TwitchOverlay';
import TwitchOverlaySetup from "./pages/TwitchOverlaySetup";
import LoginPage from './pages/LoginPage';
import AboutPage from "./pages/AboutPage";
import AutoImportLog from "./pages/AutoImportLog";
import { useAuth } from './context/AuthContext';
import UploadDraftPage from "./pages/UploadDraftPage";

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* unauthenticated entry */}
      <Route path="/login" element={<LoginPage />} />

      {/* default redirect */}
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to="/your_units" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* main routes */}
      <Route path="/your_units" element={<YourUnitsPage />} />
      <Route path="/upload" element={<UploadUnit />} />
      <Route path="/unit_lookup" element={<UnitLookupPage />} />
      <Route path="/unit_details/:unitName" element={<UnitLookupResultsPage />} />
      <Route path="/overlay" element={<TwitchOverlaySetup />} />
      <Route path="/overlay/live" element={<TwitchOverlay />} />
      <Route path="/display-units" element={<DisplayUnits />} />
      <Route path="/profile" element={<UserProfile />} />
      {/* <Route path="/auto-import-log" element={<AutoImportLog />} /> */}
      <Route path="/about" element={<AboutPage />} />
      <Route path="/upload-draft" element={<UploadDraftPage />} />

      {/* optional aliases */}
      <Route path="/your-units" element={<YourUnitsPage />} />
      <Route path="/lookup" element={<UnitLookupPage />} />
      <Route path="/twitch-overlay" element={<TwitchOverlay />} />

      {/* catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="e7-grid">
        <LeftSidebar />
        <div className="e7-maincol">
          {/* Header stays blank; Scan toggle is right-aligned */}
          <header className="e7-header">
            {/* <div className="e7-header__right">
              <ScanToggle />
            </div> */}
          </header>
          <main className="e7-content">
            <AppRoutes />
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
