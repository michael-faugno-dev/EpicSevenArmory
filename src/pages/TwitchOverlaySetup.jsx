import { useNavigate } from "react-router-dom";

const EXT_MANAGE_URL =
  "https://dashboard.twitch.tv/extensions/3qerc4w2tf5cv28ka8darpwb8qqerw-0.0.1";
const EXT_DISCOVER_URL =
  "https://dashboard.twitch.tv/extensions";

const card = {
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 10,
  background: "rgba(255,255,255,.03)",
  padding: "16px 20px",
  marginBottom: 16,
};

const stepNum = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: "50%",
  background: "rgba(145,100,230,.35)",
  color: "#c9a0ff",
  fontWeight: 700,
  fontSize: 14,
  marginRight: 10,
  flexShrink: 0,
};

const h2Style = {
  display: "flex",
  alignItems: "center",
  marginTop: 0,
  marginBottom: 10,
  fontSize: 15,
};

export default function TwitchOverlaySetup() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ marginTop: 0, marginBottom: 6 }}>Twitch Overlay — Setup</h1>
      <p style={{ opacity: 0.7, marginBottom: 20, fontSize: 14 }}>
        Follow these steps to connect your Epic Seven Armory account to the Twitch extension
        so your units appear live on stream.
      </p>

      {/* Step 1 */}
      <div style={card}>
        <h2 style={h2Style}>
          <span style={stepNum}>1</span>
          Link Your Twitch Account
        </h2>
        <p style={{ marginBottom: 10 }}>
          Open your <strong>Profile</strong> page by clicking your username at the bottom of
          the sidebar, then click <strong>Link Twitch Account</strong>. A browser window will
          open asking you to authorise Epic Seven Armory on Twitch. After approving, return to
          the app — your profile will show your Twitch username as linked.
        </p>
        <button
          className="e7-btn-primary"
          style={{ fontSize: 13 }}
          onClick={() => navigate("/profile")}
        >
          Open Profile
        </button>
      </div>

      {/* Step 2 */}
      <div style={card}>
        <h2 style={h2Style}>
          <span style={stepNum}>2</span>
          Install the Twitch Extension
        </h2>
        <ol style={{ marginBottom: 10, paddingLeft: 20 }}>
          <li>
            Open your Twitch{" "}
            <a href={EXT_DISCOVER_URL} target="_blank" rel="noreferrer">
              Extensions Manager
            </a>{" "}
            and search for <strong>Epic Seven Armory</strong>, or go directly to the{" "}
            <a href={EXT_MANAGE_URL} target="_blank" rel="noreferrer">
              extension page
            </a>
            .
          </li>
          <li>
            Click <strong>Install</strong>. If you have already installed it, click{" "}
            <strong>Manage</strong>.
          </li>
        </ol>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={EXT_MANAGE_URL}
            target="_blank"
            rel="noreferrer"
            className="e7-btn-primary"
            style={{ fontSize: 13 }}
          >
            Open Extension Page
          </a>
          <a
            href={EXT_DISCOVER_URL}
            target="_blank"
            rel="noreferrer"
            className="e7-btn-primary"
            style={{ fontSize: 13 }}
          >
            Extensions Manager
          </a>
        </div>
      </div>

      {/* Step 3 */}
      <div style={card}>
        <h2 style={h2Style}>
          <span style={stepNum}>3</span>
          Configure the Extension
        </h2>
        <ol style={{ marginBottom: 0, paddingLeft: 20 }}>
          <li>
            In <strong>My Extensions</strong>, click <strong>⋯</strong> next to Epic Seven Armory,
            then choose <strong>Configure</strong>.
          </li>
          <li>
            Enter your <strong>Epic Seven Armory username</strong> — this is the username shown at
            the bottom of the sidebar when you are logged in.
          </li>
          <li>
            Click <strong>Save</strong>.
          </li>
        </ol>
      </div>

      {/* Step 4 */}
      <div style={card}>
        <h2 style={h2Style}>
          <span style={stepNum}>4</span>
          Activate the Extension
        </h2>
        <ol style={{ marginBottom: 0, paddingLeft: 20 }}>
          <li>
            In <strong>My Extensions</strong>, find Epic Seven Armory and click the{" "}
            <strong>Activate</strong> dropdown.
          </li>
          <li>
            Choose <strong>Set as Overlay 1</strong>. The overlay is designed for the video
            overlay slot and will appear on top of your stream.
          </li>
        </ol>
      </div>

      {/* Manual Override */}
      <div style={{ ...card, borderColor: "rgba(145,100,230,.25)", background: "rgba(145,100,230,.06)" }}>
        <h2 style={{ ...h2Style, marginBottom: 8 }}>Manual Override</h2>
        <p style={{ marginBottom: 10, fontSize: 14, opacity: 0.85 }}>
          The <strong>RTA Scan</strong> toggle updates your overlay automatically when the RTA draft
          screen is detected. If the scanner picks the wrong units, use the manual selector below
          to correct it — choose up to 4 units from your roster and they will push to the overlay
          immediately.
        </p>
        <button
          className="e7-btn-primary"
          style={{ fontSize: 13 }}
          onClick={() => navigate("/overlay/live")}
        >
          Manually Select Units
        </button>
      </div>

      {/* Step 5 */}
      <div style={card}>
        <h2 style={h2Style}>
          <span style={stepNum}>5</span>
          Test on Your Channel
        </h2>
        <ol style={{ marginBottom: 10, paddingLeft: 20 }}>
          <li style={{ marginBottom: 6 }}>
            Turn on the <strong>Hero Import</strong> toggle in the app header, then open your Hero
            List in Epic Seven and browse to any hero's stat screen. Hold it for ~2 seconds — the
            app will scan and save that hero automatically. Repeat for all the heroes you want on
            your overlay.
          </li>
          <li style={{ marginBottom: 6 }}>
            Go live on Twitch. The Epic Seven Armory overlay should appear on your stream video.
          </li>
          <li>
            Turn on the <strong>RTA Scan</strong> toggle, then queue into an RTA match. When the draft
            screen appears the app detects your picks and updates the overlay with those units and
            their full stat cards in real time.
          </li>
        </ol>
        <p style={{ marginBottom: 0, opacity: 0.75, fontSize: 13 }}>
          If the overlay is not showing, verify that the extension is set to{" "}
          <strong>Overlay 1</strong>, that your Twitch account is linked in Profile, and that
          your Epic Seven Armory username is entered correctly in the extension config.
        </p>
      </div>
    </div>
  );
}
