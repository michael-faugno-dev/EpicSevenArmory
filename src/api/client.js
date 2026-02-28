// src/api/client.js
import axios from "axios";

const vite = typeof import.meta !== "undefined" ? import.meta.env : {};
export const API_BASE =
  vite?.VITE_API_BASE_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  "http://localhost:5000";

export const api = axios.create({
  baseURL: API_BASE,
});

// Attach Bearer token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, only clear credentials and redirect if we actually had a token.
// Without this check, unauthenticated requests that return 401 would wipe a
// freshly stored token and kick the user back to login in a loop.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hadToken = !!localStorage.getItem("token");
      if (hadToken) {
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

/** Returns Authorization header object for use with raw fetch() calls. */
export function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
