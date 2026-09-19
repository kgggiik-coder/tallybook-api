import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const COLORS = {
  ink: "#1C2B22", paper: "#F3F1EC", moss: "#2F5233", rust: "#B4472A", slate: "#5C6660",
};

function Field({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: COLORS.slate }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full text-base px-3 py-3 border"
        style={{ borderColor: COLORS.ink, background: COLORS.paper, minHeight: 48 }}
      />
    </div>
  );
}

export default function AuthPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ businessName: "", name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await signup(form);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ color: COLORS.ink, background: COLORS.paper }} className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <p style={{ fontFamily: "'Source Serif 4', serif" }} className="text-2xl font-semibold mb-1 text-center">Tallybook</p>
        <p className="text-sm text-center mb-8" style={{ color: COLORS.slate }}>
          {mode === "login" ? "Log in to your dashboard" : "Set up your business"}
        </p>

        <form onSubmit={submit} className="border p-6 space-y-4" style={{ borderColor: COLORS.ink }}>
          {mode === "signup" && (
            <>
              <Field label="Business name" value={form.businessName} onChange={(v) => setForm({ ...form, businessName: v })} />
              <Field label="Your name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            </>
          )}
          <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />

          {error && <div className="text-xs px-3 py-2 text-white" style={{ background: COLORS.rust }}>{error}</div>}

          <button type="submit" disabled={loading} className="w-full py-3 text-sm text-white flex items-center justify-center gap-2" style={{ background: COLORS.moss, minHeight: 48 }}>
            {loading && <Loader2 size={14} className="animate-spin" />}
            {mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }} className="text-xs mt-4 w-full text-center py-2" style={{ color: COLORS.slate }}>
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
