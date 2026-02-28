// UploadUnit.jsx
//
// Two-step upload flow for adding a hero unit to the user's profile:
//   Step 1: POST /upload_files — save the screenshot(s) or Fribbels JSON to disk.
//   Step 2: POST /display — run OCR / JSON parsing and return extracted stat objects.
// The result is passed to /display-units via React Router location state
// so DisplayUnits.jsx can render the stats without a second network call.
//
// Accepts either:
//   - One or more E7 gear screen screenshots (OCR path)
//   - A single Fribbels Gear Optimizer export (.json)
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const cardStyle = {
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 10,
  background: 'rgba(255,255,255,.03)',
  padding: 12,
};

export default function UploadUnit() {
  const { isAuthenticated } = useAuth();
  const [files, setFiles] = useState([]);
  const [jsonFile, setJsonFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const username = localStorage.getItem('username');
  const rank = localStorage.getItem('rta_rank');

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files));
    setJsonFile(null);
  };

  const handleJsonFileChange = (e) => {
    setJsonFile(e.target.files[0]);
    setFiles([]);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      alert('You must be logged in to upload files.');
      return;
    }

    setLoading(true);

    const formData = new FormData();
    if (files.length > 0) {
      files.forEach((file, index) => {
        formData.append(`file${index}`, file);
      });
    } else if (jsonFile) {
      formData.append('json_file', jsonFile);
    } else {
      alert('Please select file(s) to upload.');
      setLoading(false);
      return;
    }

    try {
      const uploadResponse = await api.post('/upload_files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const filenames = uploadResponse.data.filenames;
      const displayResponse = await api.post('/display', {
        filenames,
        rank,
        isJson: !!jsonFile
      });

      setLoading(false);
      navigate('/display-units', { state: { stats: displayResponse.data } });
    } catch (error) {
      setLoading(false);
      console.error('Error details:', error.response?.data || error.message);
      alert(`There was an error uploading and processing the file(s): ${error.response?.data?.error || error.message}`);
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: 10 }}>Scan E7 Screenshot or Fribbels Export</h2>
      <div style={{ fontSize: 13, opacity: .8, marginBottom: 10 }}>
        Logged in as <strong>{username || '—'}</strong>{rank ? <> · Rank: <strong>{rank}</strong></> : null}
      </div>

      <form onSubmit={handleUpload} encType="multipart/form-data" style={cardStyle}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Upload Screenshot</span>
          <input type="file" name="file" multiple className="e7-input" onChange={handleFileChange} />
        </label>

        <div style={{ height: 10 }} />

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Or Upload Fribbels Export (.json)</span>
          <input type="file" name="json_file" accept=".json" className="e7-input" onChange={handleJsonFileChange} />
        </label>

        <div style={{ marginTop: 12 }}>
          <button type="submit" className="e7-btn-primary" disabled={loading}>
            {loading ? 'Processing…' : 'Analyze File(s)'}
          </button>
        </div>
      </form>
    </div>
  );
}
