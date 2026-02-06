import React, { useEffect, useState } from "react";

export default function AboutPage() {
  const [e7Name, setE7Name] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    // Try to read the Epic Seven username from localStorage (your app uses this key)
    const fromLS = localStorage.getItem("epic_seven_account");
    setE7Name(fromLS || ""); // fallback if not set
  }, []);

  const onSave = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem("epic_seven_account", e7Name || "");
      setSaveMsg("Saved! (stored locally)");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch {
      setSaveMsg("Could not save locally.");
      setTimeout(() => setSaveMsg(""), 2000);
    }
  };

  return (
    <div className="container py-4">
      <h1 className="mb-3">About</h1>

      {/* About the App / Me */}
      <div className="card mb-3 p-3">
        <h2 className="h5 mb-2">Epic Seven Armory</h2>
        <p className="mb-0">
          Join us at in the Epic Seven Armory Discord : https://discord.gg/gTMhrbVxk . <br></br>
          A desktop-first tool built with Electron + React and a Flask backend to help players
          catalog their units, scan in-game stats, and prep overlays for streaming. I’m Michael
          Faugno, software engineer and long-time music educator, building this to scratch my own
          itch and share it with the community. My E7 username is MikeyFogs.
        </p>
      </div>

      {/* Roadmap */}
      <div className="card mb-3 p-3">
        <h2 className="h5 mb-2">Coming in the Next Version</h2>
        <ul className="mb-0">
          <li>Auto Unit Detection: Units will be imported automatically when hovering over them in the Hero List.</li>
          <li>Auto Twitch PVP Unit Detection: Units will be adjusted automatically in the overlay before a PVP battle begins.</li>
          <li>Improved window-follow for the scanner to reduce missed/offset captures.</li>
          <li>Light/Dark Mode</li>
        </ul>
      </div>

      {/* Known Issues */}
      <div className="card mb-3 p-3">
        <h2 className="h5 mb-2">Known Issues / Things That Don’t Work Yet</h2>
        <ul className="mb-0">
          <li>Only 1 unit of each name is allowed in your profile.</li>
          <li>Unit names and stats occasionaly display incorrectly after being imported.</li>
           <li>.</li>
        </ul>
      </div>
      
        {/* Special Thanks */}
        <div className="card mb-3 p-3">
        <h2 className="h5 mb-2">Special Thanks To:</h2>
        <ul className="mb-0">
            <li><strong>Guild:</strong> Bootkek</li>
            <li><strong>Friends:</strong> Stephen, Mo, Sam, and Dana</li>
            <li>
            <strong>Data/API:</strong> <a href="https://epic7db.com" target="_blank" rel="noopener noreferrer">Epic7DB</a>—
            whose API powers some of the hero data shown in this app
            </li>
        </ul>
        </div>

      {/* Version & Support */}
      <div className="card mb-3 p-3">
        <h2 className="h5 mb-2">Version & Support</h2>
        <p className="mb-2"><strong>Version:</strong> 0.6.0-beta</p>
        <p className="mb-2">
          If this project helps you, consider supporting it via the “Buy Me a Coffee” link in the sidebar.
        </p>
        <p className="mb-0 text-muted">
          Data is stored locally and in a MongoDb database to be used for the twitch overlay; no analytics or tracking are embedded in the app.
        </p>
      </div>
    </div>
  );
}
