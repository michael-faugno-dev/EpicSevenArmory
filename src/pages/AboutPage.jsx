
const cardStyle = {
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 10,
  background: "rgba(255,255,255,.03)",
  padding: "16px 20px",
  marginBottom: 16,
};

const h2Style = { marginTop: 0, marginBottom: 10, fontSize: 16 };

export default function AboutPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ marginTop: 0, marginBottom: 6 }}>About</h1>
      <p style={{ opacity: 0.7, marginBottom: 20, fontSize: 14 }}>
        Epic Seven Armory — version 0.7.0-beta &nbsp;·&nbsp;{" "}
        <a href="https://discord.gg/gTMhrbVxkN" target="_blank" rel="noopener noreferrer">
          Join the Discord
        </a>
      </p>

      {/* What is it */}
      <div style={cardStyle}>
        <h2 style={h2Style}>What Is Epic Seven Armory?</h2>
        <p style={{ marginBottom: 0 }}>
          A desktop application built with Electron, React, and a Flask backend that helps Epic Seven
          players catalogue their roster, automatically scan hero stats while playing, detect draft
          picks in real time, and broadcast selected units to Twitch viewers via a live overlay
          extension — all without interrupting gameplay.
        </p>
        <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.8 }}>
          Built by Michael Faugno (MikeyFogs) — software engineer and long-time music educator.
          Contributions, bug reports, and feedback are welcome in the Discord above.
        </p>
      </div>

      {/* Auto Unit Import */}
      <div style={cardStyle}>
        <h2 style={h2Style}>Auto Unit Import</h2>
        <p style={{ marginBottom: 8 }}>
          The <strong>Hero Import</strong> toggle in the top-right header monitors your Epic Seven game
          window in the background. When it detects that you have been on a hero's stat screen for
          roughly two seconds, it automatically:
        </p>
        <ol style={{ marginBottom: 8, paddingLeft: 20 }}>
          <li>Captures the stat screen via a silent screenshot</li>
          <li>Runs OCR to extract the hero's name, CP, and all combat stats</li>
          <li>Adds or updates the unit in your roster</li>
          <li>Shows a toast: <em>"Added: Blood Moon Haste (122,861 CP)"</em></li>
        </ol>
        <p style={{ marginBottom: 6, opacity: 0.8, fontSize: 13 }}>
          Just turn it on and browse your heroes normally — the import happens in the background.
          Every import is logged in the Auto-Import Log (accessible from the sidebar).
        </p>
        <p style={{ marginBottom: 0, fontSize: 13, color: "#c9a0ff" }}>
          Tip: For best OCR accuracy, set your in-game background to a plain or low-detail scene
          before scanning. Busy artwork, particle effects, and animations behind the stat panel can
          cause the text reader to misread stat values.
        </p>
      </div>

      {/* Auto Draft Detection */}
      <div style={cardStyle}>
        <h2 style={h2Style}>Auto Draft Detection</h2>
        <p style={{ marginBottom: 8 }}>
          The <strong>RTA Scan</strong> toggle monitors for the RTA draft screen using SIFT feature
          matching — a computer-vision technique that identifies key visual landmarks regardless of
          minor resolution differences. When the draft screen is detected:
        </p>
        <ol style={{ marginBottom: 8, paddingLeft: 20 }}>
          <li>The scanner captures a frame of the draft screen</li>
          <li>It identifies which of your saved units appear as picks or bans</li>
          <li>Those units are instantly pushed to the Twitch overlay</li>
          <li>A toast shows the detected unit names</li>
        </ol>
        <p style={{ marginBottom: 0, opacity: 0.8, fontSize: 13 }}>
          Your Twitch viewers see your picks update live without you touching anything.
        </p>
      </div>

      {/* Twitch Overlay */}
      <div style={cardStyle}>
        <h2 style={h2Style}>Twitch Extension Overlay</h2>
        <p style={{ marginBottom: 10 }}>
          A native Twitch extension sits on top of your stream video and shows up to four of your
          units with full stat breakdowns. Viewers can click each unit tab to see attack, defense,
          health, speed, crit chance/damage, effectiveness, and gear set info. No browser source
          required.
        </p>
        <p style={{ marginBottom: 6, fontWeight: 600, fontSize: 13 }}>How to populate the overlay:</p>
        <ul style={{ marginBottom: 0, paddingLeft: 20, fontSize: 13 }}>
          <li style={{ marginBottom: 6 }}>
            <strong>Hero Import toggle ON → open your Hero List in-game.</strong> Browse to any hero's
            stat screen and hold it for ~2 seconds. The app scans the screen, saves that hero's stats
            to your profile, and confirms with a toast. Flip through as many heroes as you like — each
            one is captured automatically.
          </li>
          <li>
            <strong>RTA Scan toggle ON → queue into an RTA match.</strong> When the draft screen appears
            the app detects it, identifies which of your saved units are being picked, and instantly
            updates the Twitch overlay with those units and their full stat cards — live, while you
            play.
          </li>
        </ul>
      </div>

      {/* Roadmap */}
      <div style={cardStyle}>
        <h2 style={h2Style}>Coming Next</h2>
        <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
          <li>Multiple copies of the same hero in one roster (e.g. two different Senya builds)</li>
          <li>Improved SIFT accuracy on non-standard resolutions and window sizes</li>
        </ul>
      </div>

      {/* Known Issues */}
      <div style={cardStyle}>
        <h2 style={h2Style}>Known Issues</h2>
        <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
          <li>
            Only one copy of each hero is stored per account — if you have two copies with different
            builds, the second import will overwrite the first.
          </li>
          <li>
            OCR occasionally misreads stat numbers on non-standard display scaling. You can correct
            any value by clicking <strong>Edit</strong> on the unit card in Your Units.
          </li>
          <li>
            The scanner requires the Epic Seven game window to be unobscured and running in the
            foreground at the moment of capture.
          </li>
          <li>
            Very recently released heroes may not yet appear in the official hero list used for name
            matching. Known missing heroes are added manually as they are discovered — report any in
            the Discord. Until a hero's portrait is available from the image provider, <strong>Aither's
            portrait</strong> is shown as a placeholder.
          </li>
        </ul>
      </div>

      {/* Credits */}
      <div style={cardStyle}>
        <h2 style={h2Style}>Special Thanks</h2>
        <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
          <li><strong>Guild:</strong> Bootkek</li>
          <li><strong>Friends:</strong> Stephen, Mo, and Sam</li>
          <li>
            <strong>Data / API:</strong>{" "}
            <a href="https://epic7db.com" target="_blank" rel="noopener noreferrer">
              Epic7DB
            </a>{" "}
            — hero data and unit images used throughout the app
          </li>
        </ul>
      </div>

      {/* Support */}
      <div style={cardStyle}>
        <h2 style={h2Style}>Support the Project</h2>
        <p style={{ marginBottom: 0, opacity: 0.8 }}>
          If Epic Seven Armory saves you time or adds something to your stream, consider donating
          via the link in the sidebar. This helps with server costs. Data is stored in a MongoDB
          database solely to power the Twitch overlay — no analytics or tracking are embedded in
          the app.
        </p>
      </div>
    </div>
  );
}
