// AuthContext.jsx
// Global authentication state. Bootstraps from localStorage on load so the
// user stays logged in across page refreshes. Google OAuth is the only sign-in
// method; the app JWT (HS256) is stored in localStorage['token'] and sent as
// the Authorization header on every API request via the axios interceptor in client.js.
import React, { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null); // { username }

  // Bootstrap from localStorage on load
  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) {
      setTokenState(t);
      setIsAuthenticated(true);
      const username = localStorage.getItem('username');
      if (username) setUser({ username });
    }
  }, []);

  // Google-only: accept app JWT directly
  const loginWithToken = (appToken, extras = {}) => {
    if (!appToken) throw new Error('Missing token');
    setTokenState(appToken);
    setIsAuthenticated(true);
    localStorage.setItem('token', appToken);

    const uname = extras.username || localStorage.getItem('username') || '';
    if (uname) {
      localStorage.setItem('username', uname);
      setUser({ username: uname });
    }
    return true;
  };

  const logout = () => {
    setTokenState(null);
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('username');
  };

  const value = {
    token,
    isAuthenticated,
    user,
    loginWithToken,           // new path for Google auth
    setToken: loginWithToken, // alias so existing callers still work
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
