import React, { useState } from "react";
import API from "../api";

const initialForm = {
  organizationName: "",
  kraPin: "",
  currency: "Ksh",
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  username: "",
  password: "",
  confirmPassword: "",
};

function getErrorMessage(error) {
  const data = error.response?.data;
  if (!data) return "Unable to create your account. Please try again.";

  const collectMessages = (value) => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(collectMessages);
    if (value && typeof value === "object") {
      return Object.values(value).flatMap(collectMessages);
    }
    return [];
  };
  const messages = collectMessages(data);

  return messages.join(" ") || "Unable to create your account. Please try again.";
}

export default function Signup({ onSuccess, onBack }) {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await API.post("auth/signup/", {
        username: form.username,
        password: form.password,
        first_name: form.firstName,
        last_name: form.lastName,
        email: form.email,
        phone_number: form.phoneNumber,
        company_profile: {
          name: form.organizationName,
          kra_pin: form.kraPin,
          currency: form.currency,
          theme_color: "#10b981",
        },
      });

      const tokenResponse = await API.post("token/", {
        username: form.username,
        password: form.password,
      });
      localStorage.setItem("access_token", tokenResponse.data.access);
      localStorage.setItem("refresh_token", tokenResponse.data.refresh);

      const userResponse = await API.get("accounts/me/");
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
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-emerald-500";
  const labelClass =
    "mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8">
        <h2 className="text-2xl font-bold text-white">Create your organization</h2>
        <p className="mb-6 mt-2 text-sm text-slate-400">
          Set up your workspace and administrator account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-emerald-400">
              Organization details
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="organizationName">
                  Organization name
                </label>
                <input
                  id="organizationName"
                  name="organizationName"
                  value={form.organizationName}
                  onChange={handleChange}
                  className={inputClass}
                  autoComplete="organization"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="kraPin">
                  KRA PIN
                </label>
                <input
                  id="kraPin"
                  name="kraPin"
                  value={form.kraPin}
                  onChange={handleChange}
                  className={inputClass}
                  maxLength={11}
                  placeholder="A123456789B"
                  autoCapitalize="characters"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="currency">
                  Base currency
                </label>
                <select
                  id="currency"
                  name="currency"
                  value={form.currency}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="Ksh">Ksh</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-emerald-400">
              Administrator account
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="firstName">
                  First name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  className={inputClass}
                  autoComplete="given-name"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="lastName">
                  Last name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  className={inputClass}
                  autoComplete="family-name"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className={inputClass}
                  autoComplete="email"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  className={inputClass}
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="phoneNumber">
                  Phone number
                </label>
                <input
                  id="phoneNumber"
                  name="phoneNumber"
                  type="tel"
                  value={form.phoneNumber}
                  onChange={handleChange}
                  className={inputClass}
                  autoComplete="tel"
                  placeholder="0700236628 or +254700236628"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  className={inputClass}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="confirmPassword">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  className={inputClass}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>
          </section>

          {error && (
            <p role="alert" className="text-sm text-rose-400">
              {error}
            </p>
          )}
          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-500 p-3 font-semibold text-slate-950 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating your workspace..." : "Create organization"}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full text-sm text-slate-400 hover:text-white"
            >
              Back to home
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
