import React, { useState } from "react";
import API from "../api";

export default function Login({ onSuccess, onBack, onForgotPassword }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await API.post("token/", form);
      localStorage.setItem("access_token", response.data.access);
      localStorage.setItem("refresh_token", response.data.refresh);
      const userResponse = await API.get("accounts/me/");
      if (userResponse.data.organization_name) {
        localStorage.setItem(
          "organization_name",
          userResponse.data.organization_name,
        );
      }
      const organizations = userResponse.data.organizations || [];
      localStorage.setItem("organizations", JSON.stringify(organizations));
      if (organizations[0]?.id) {
        localStorage.setItem("organization_id", String(organizations[0].id));
        localStorage.setItem("organization_name", organizations[0].name);
        localStorage.setItem(
          "organization_theme_color",
          organizations[0].theme_color || "#10b981",
        );
      }
      if (userResponse.data.role) {
        localStorage.setItem("user_role", userResponse.data.role);
      }
      onSuccess(userResponse.data.role, organizations);
    } catch (err) {
      setError("Invalid credentials or server error.");
      console.error("Login error", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
      <div className="w-full max-w-md bg-slate-900 p-6 rounded-2xl shadow-xl border border-slate-800">
        <h2 className="text-2xl font-bold text-white mb-2">Sign In</h2>
        <p className="text-slate-400 text-sm mb-6">
          Enter your payroll admin credentials.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-400 text-xs uppercase tracking-widest mb-1">
              Username or phone number
            </label>
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              className="w-full rounded bg-slate-950 border border-slate-800 p-2 text-sm text-white"
              placeholder="Username or 0700236628"
              required
            />
          </div>
          <div>
            <label className="block text-slate-400 text-xs uppercase tracking-widest mb-1">
              Password
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className="w-full rounded bg-slate-950 border border-slate-800 p-2 text-sm text-white"
              placeholder="password"
              required
            />
          </div>
          {error && <div className="text-sm text-rose-400">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 text-slate-900 p-3 rounded font-semibold hover:bg-emerald-600 transition"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <button
            type="button"
            onClick={onForgotPassword}
            className="w-full text-sm font-medium text-emerald-400 hover:text-emerald-300"
          >
            Forgot password?
          </button>
          <button
            type="button"
            onClick={onBack}
            className="w-full text-slate-400 text-sm"
          >
            Back
          </button>
        </form>
      </div>
    </div>
  );
}
