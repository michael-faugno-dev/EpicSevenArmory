// src/api/client.js
import axios from "axios";

// Works with both Vite and CRA env styles.
const vite = typeof import.meta !== "undefined" ? import.meta.env : {};
const base =
  vite?.VITE_API_BASE_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  "http://localhost:5000";

export const api = axios.create({
  baseURL: base,
  withCredentials: true, // keep if you use cookies/JWT from backend
});

// Example endpoints used across pages
export const getUnitData = () => api.get("/get_unit_data"); // README routes
export const updateSelectedUnits = (payload) =>
  api.post("/update_selected_units", payload);
export const uploadStatsImage = (formData) =>
  api.post("/upload_stats_image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
