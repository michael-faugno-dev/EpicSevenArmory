import React, { useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";

function getUsernameFallback() {
  try {
    const ls = localStorage.getItem("epic_seven_account");
    if (!ls) return null;
    return typeof ls === "string" ? ls : String(ls);
  } catch {
    return null;
  }
}

export default function UploadDraftPage() {
  const { user } = useAuth?.() || {};
  const username = (user?.username) || getUsernameFallback();

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    setFile(f || null);
    setResult(null);
    if (f) setPreview(URL.createObjectURL(f));
    else setPreview(null);
  };

  const onUpload = async () => {
    if (!file) {
      setStatus("Please choose an image of the end-of-battle draft screen.");
      return;
    }
    if (!username) {
      setStatus("No username available. Please log in first.");
      return;
    }

    try {
      setBusy(true);
      setStatus("Uploading and detecting...");
      const fd = new FormData();
      fd.append("image", file);

      const res = await axios.post(`${API_BASE}/draft/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data", "Username": username },
      });

      setResult(res.data);
      setStatus("Saved! Your selected units were updated.");
    } catch (err) {
      console.error(err);
      setStatus(err?.response?.data?.error || "Upload or detection failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-3">Upload Draft Screenshot</h1>
      <p className="text-sm mb-4">
        Upload the end-of-battle screen showing your draft. We’ll detect the units
        and update your selected units automatically.
      </p>

      <div className="mb-3">
        <input type="file" accept="image/*" onChange={onPick} disabled={busy} />
      </div>

      {preview && (
        <div className="mb-4">
          <img
            src={preview}
            alt="preview"
            style={{ maxWidth: "100%", borderRadius: 8 }}
          />
        </div>
      )}

      <button
        onClick={onUpload}
        disabled={busy || !file}
        className="px-4 py-2 rounded-md shadow border"
      >
        {busy ? "Working..." : "Upload & Detect"}
      </button>

      {status && <div className="mt-3 text-sm">{status}</div>}

      {result && (
        <div className="mt-4 text-sm">
          <div><strong>Username:</strong> {result.username}</div>
          <div className="mt-2">
            <strong>Detected slugs:</strong>{" "}
            {result.detected_slugs?.length ? result.detected_slugs.join(", ") : "(none)"}
          </div>
          <div className="mt-2">
            <strong>Saved unit_ids:</strong>{" "}
            {result.saved_unit_ids?.filter(Boolean).length
              ? result.saved_unit_ids.join(", ")
              : "(none)"}
          </div>
          {Array.isArray(result.unmatched_slugs) && result.unmatched_slugs.length > 0 && (
            <div className="mt-2">
              <strong>Couldn’t match to your units:</strong>{" "}
              {result.unmatched_slugs.join(", ")}
            </div>
          )}
          {Array.isArray(result.match_debug) && result.match_debug.length > 0 && (
            <pre className="mt-3 p-2 bg-black/10 rounded overflow-auto">
{JSON.stringify(result.match_debug, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
