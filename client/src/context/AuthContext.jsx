import React, { createContext, useContext, useState, useEffect } from 'react';
import { login as apiLogin, signup as apiSignup, logout as apiLogout, setAccessToken } from '../api/index.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [vendor, setVendor] = useState(() => {
    try {
      const saved = localStorage.getItem('bayana_vendor');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem('bayana_token') || null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Sync token with API client
  useEffect(() => {
    if (token) {
      setAccessToken(token);
    }
  }, [token]);

  // Attempt refresh on app startup
  useEffect(() => {
    async function initAuth() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1'}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setToken(data.accessToken);
          setAccessToken(data.accessToken);
          localStorage.setItem('bayana_token', data.accessToken);
        } else if (!token) {
          setVendor(null);
          localStorage.removeItem('bayana_vendor');
        }
      } catch {
        // network or server down
      } finally {
        setLoading(false);
      }
    }
    initAuth();
  }, []);

  const login = async (credentials) => {
    const res = await apiLogin(credentials);
    setVendor(res.vendor);
    setToken(res.accessToken);
    setAccessToken(res.accessToken);
    localStorage.setItem('bayana_vendor', JSON.stringify(res.vendor));
    localStorage.setItem('bayana_token', res.accessToken);
    return res;
  };

  const signup = async (data) => {
    const res = await apiSignup(data);
    setVendor(res.vendor);
    setToken(res.accessToken);
    setAccessToken(res.accessToken);
    localStorage.setItem('bayana_vendor', JSON.stringify(res.vendor));
    localStorage.setItem('bayana_token', res.accessToken);
    return res;
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch {
      // ignore
    }
    setVendor(null);
    setToken(null);
    setAccessToken(null);
    localStorage.removeItem('bayana_vendor');
    localStorage.removeItem('bayana_token');
  };

  const updateVendorState = (updated) => {
    setVendor((prev) => {
      const next = { ...prev, ...updated };
      localStorage.setItem('bayana_vendor', JSON.stringify(next));
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ vendor, token, loading, login, signup, logout, updateVendorState, isAuthenticated: Boolean(vendor && token) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
