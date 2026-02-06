import React from 'react';

const HomePage = () => (
  <div className="container">
    <h1>Features</h1>
    <ul className="features-list">
      <li><strong>Twitch Overlay:</strong> Once your units are uploaded and your profile is set, easily display your units in arena and guild battles with a Twitch Overlay. Directions to enable 
      the overlay are provided.</li>
      <br></br>
      <li><strong>Stat Extraction:</strong> Extract stats directly from screenshots or a Fribbels export JSON file</li>
      <br></br>
      <li><strong>Unit Look Up:</strong> Stay up-to-date with the latest unit stats and abilities.</li>
      <br></br>
      <li><strong>User Profiles:</strong> Create and manage your profile, store favorite units, and keep track of your builds all in one place.</li>
      <br></br>
      <li><strong>Build Finder (disabled):</strong> Search through an extensive database to find average builds for every unit based on RTA rank.</li>

      <br></br>
    </ul>
    <div className='contact'></div>
  </div>
);

export default HomePage;