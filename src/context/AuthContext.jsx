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
    // (keep username if you want it persisted; otherwise also remove it)
    // localStorage.removeItem('username');
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
