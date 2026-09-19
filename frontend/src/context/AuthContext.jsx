import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiFetch } from "../lib/api";

const AuthContext = createContext(null);
const STORAGE_KEY = "tallybook_token";

// Unlike the Claude Artifacts previews (which can't use browser storage),
// this is a real deployed app — persisting the token in localStorage here
// is the standard, correct choice, and is what lets a page refresh keep
// you logged in instead of bouncing back to /login every time.

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    apiFetch("/auth/me", { token })
      .then((data) => {
        setUser(data.user);
        setBusiness(data.business);
      })
      .catch(() => {
        // Token is stale/invalid (e.g. server restarted with a new
        // JWT_SECRET, or the account was removed) — clear it and bounce
        // to login rather than looping on a request that will never succeed.
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const applySession = (data) => {
    localStorage.setItem(STORAGE_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    setBusiness(data.business);
  };

  const login = useCallback(async (email, password) => {
    const data = await apiFetch("/auth/login", { method: "POST", body: { email, password } });
    applySession(data);
  }, []);

  const signup = useCallback(async (form) => {
    const data = await apiFetch("/auth/signup", { method: "POST", body: form });
    applySession(data);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
    setBusiness(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, business, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
