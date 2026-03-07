import { useState } from "react";
import { api } from "../api/client";

const CATEGORIES = ["UI Issue", "Import Issue", "RTA Scan Issue", "Twitch Overlay", "Other"];

const card = {
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 12,
  background: "rgba(255,255,255,.03)",
  padding: "20px 24px",
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const labelStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text)",
  opacity: 0.85,
};

const inputStyle = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 13,
  padding: "8px 12px",
  outline: "none",
  transition: "border-color .15s",
  width: "100%",
  boxSizing: "border-box",
};

const textareaStyle = {
  ...inputStyle,
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.5,
};

export default function BugReportPage() {
  const [category, setCategory]       = useState("Other");
  const [description, setDescription] = useState("");
  const [steps, setSteps]             = useState("");
  const [status, setStatus]           = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!description.trim()) return;
    setStatus("sending");
    try {
      await api.post("/bug_report", { category, description, steps });
      setStatus("ok");
      setDescription("");
      setSteps("");
      setCategory("Other");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 620, display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <div style={card}>
        <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 600 }}>Report a Bug</h1>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.65 }}>
          Describe what went wrong and how to reproduce it. Reports are reviewed by the developer.
        </p>
      </div>

      {/* Form */}
      <div style={card}>
        {status === "ok" ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
            <p style={{ margin: "0 0 16px", fontWeight: 600, fontSize: 15 }}>
              Bug report submitted — thank you!
            </p>
            <button
              onClick={() => setStatus(null)}
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,.2)",
                borderRadius: 8,
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 13,
                padding: "6px 16px",
              }}
            >
              Submit another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Category */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Description */}
            <div style={fieldStyle}>
              <label style={labelStyle}>
                Description <span style={{ color: "#f87171" }}>*</span>
              </label>
              <textarea
                required
                rows={4}
                placeholder="What happened? What did you expect to happen?"
                value={description}
                onChange={e => setDescription(e.target.value)}
                style={textareaStyle}
              />
            </div>

            {/* Steps */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Steps to Reproduce <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></label>
              <textarea
                rows={3}
                placeholder={"1. Open hero screen\n2. Navigate to ..."}
                value={steps}
                onChange={e => setSteps(e.target.value)}
                style={textareaStyle}
              />
            </div>

            {status === "error" && (
              <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>
                Failed to submit — please try again.
              </p>
            )}

            <div>
              <button
                type="submit"
                disabled={status === "sending" || !description.trim()}
                style={{
                  background: status === "sending" ? "rgba(59,130,246,.5)" : "#3b82f6",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  cursor: status === "sending" || !description.trim() ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: !description.trim() ? 0.45 : 1,
                  padding: "9px 20px",
                  transition: "background .15s, opacity .15s",
                }}
              >
                {status === "sending" ? "Submitting…" : "Submit Report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
