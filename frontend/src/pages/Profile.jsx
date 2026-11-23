import React, { useEffect, useState } from "react";
import API from "../api";

export default function Profile({
  settingsMode = false,
  onOrganizationChanged,
  passwordResetMode = false,
  onPasswordResetComplete,
}) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [organization, setOrganization] = useState(null);
  const [organizationForm, setOrganizationForm] = useState({
    name: "",
    kra_pin: "",
    currency: "Ksh",
  });
  const [organizationColor, setOrganizationColor] = useState(
    () => localStorage.getItem("organization_theme_color") || "#10b981",
  );
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingOrganization, setSavingOrganization] = useState(false);
  const [passwordResetComplete, setPasswordResetComplete] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError("");
      try {
        const response = await API.get("accounts/me/");
        setProfile(response.data);
        setForm({
          first_name: response.data.first_name || "",
          last_name: response.data.last_name || "",
          email: response.data.email || "",
          password: "",
        });
        const selectedOrganization = response.data.organizations?.find(
          (item) =>
            String(item.id) === localStorage.getItem("organization_id"),
        );
        setOrganization(selectedOrganization || response.data.organizations?.[0] || null);
        const activeOrganization = selectedOrganization || response.data.organizations?.[0];
        if (activeOrganization) {
          setOrganizationForm({
            name: activeOrganization.name || "",
            kra_pin: activeOrganization.kra_pin || "",
            currency: activeOrganization.currency || "Ksh",
          });
        }
        setOrganizationColor(
          selectedOrganization?.theme_color || response.data.organizations?.[0]?.theme_color || "#10b981",
        );
      } catch (err) {
        console.error(err);
        setError("Unable to load profile. Please sign in again.");
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleThemeSave = async (event) => {
    event.preventDefault();
    setSavingTheme(true);
    setSuccess("");
    setError("");
    try {
      const response = await API.patch("accounts/organization/", {
        theme_color: organizationColor,
      });
      setOrganization(response.data);
      onOrganizationChanged?.(response.data);
      localStorage.setItem("organization_theme_color", response.data.theme_color);
      document.documentElement.style.setProperty("--accent", response.data.theme_color);
      setSuccess("Organization theme updated successfully.");
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.theme_color?.[0] || "Unable to update organization theme.");
    } finally {
      setSavingTheme(false);
    }
  };

  const handleOrganizationChange = (event) => {
    const { name, value } = event.target;
    setOrganizationForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleOrganizationSave = async (event) => {
    event.preventDefault();
    setSavingOrganization(true);
    setSuccess("");
    setError("");
    try {
      const response = await API.patch("accounts/organization/", organizationForm);
      setOrganization(response.data);
      setOrganizationForm({
        name: response.data.name,
        kra_pin: response.data.kra_pin,
        currency: response.data.currency,
      });
      onOrganizationChanged?.(response.data);
      setSuccess("Organization details updated successfully.");
    } catch (err) {
      console.error(err);
      const data = err.response?.data;
      const message = data && typeof data === "object"
        ? Object.values(data).flat().join(" ")
        : "";
      setError(message || "Unable to update organization details.");
    } finally {
      setSavingOrganization(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSuccess("");
    setError("");

    try {
      if (passwordResetMode && !form.password) {
        setError("Enter a new password.");
        return;
      }
      const payload = passwordResetMode
        ? { password: form.password }
        : {
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email,
            ...(form.password ? { password: form.password } : {}),
          };

      const response = await API.patch("accounts/me/", payload);
      setProfile(response.data);
      setForm((prev) => ({ ...prev, password: "" }));
      if (passwordResetMode) {
        setPasswordResetComplete(true);
        setSuccess("Password updated successfully.");
      } else {
        setSuccess("Profile updated successfully.");
      }
    } catch (err) {
      console.error(err);
      setError("Unable to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return <div className="p-8 text-slate-300">Loading employee profile…</div>;
  if (error && !profile)
    return <div className="p-8 text-rose-400">{error}</div>;

  const canManageOrganization = ["ADMIN", "HR"].includes(profile.role);

  return (
    <div className="p-8 space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
        <div className="flex items-center justify-between gap-4 flex-col md:flex-row">
          <div>
            <h1 className="text-3xl font-black text-white">
              {settingsMode ? "Organization Settings" : profile.username}
            </h1>
            <p className="text-slate-400 mt-2">
              {settingsMode
                ? "Customize the workspace for your organization."
                : "Employee Profile Dashboard"}
            </p>
          </div>
          <div className="rounded-3xl bg-slate-950 p-4 text-sm text-slate-300">
            Role:{" "}
              <span className="font-semibold" style={{ color: "var(--accent)" }}>
              {profile.role || "Employee"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white">
            {passwordResetMode ? "Set a new password" : "Update Profile"}
          </h2>
          {success && <div className="text-emerald-400 text-sm">{success}</div>}
          {error && <div className="text-rose-400 text-sm">{error}</div>}
          {passwordResetComplete ? (
            <button
              type="button"
              onClick={onPasswordResetComplete}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-900 transition hover:bg-emerald-400"
            >
              Return to sign in
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!passwordResetMode && (
                <>
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-widest text-slate-400">
                      First Name
                    </label>
                    <input
                      name="first_name"
                      value={form.first_name}
                      onChange={handleChange}
                      className="w-full rounded border border-slate-800 bg-slate-950 p-3 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-widest text-slate-400">
                      Last Name
                    </label>
                    <input
                      name="last_name"
                      value={form.last_name}
                      onChange={handleChange}
                      className="w-full rounded border border-slate-800 bg-slate-950 p-3 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-widest text-slate-400">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      className="w-full rounded border border-slate-800 bg-slate-950 p-3 text-sm text-white"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-slate-400">
                  New Password
                </label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  className="w-full rounded border border-slate-800 bg-slate-950 p-3 text-sm text-white"
                  placeholder={
                    passwordResetMode
                      ? "Enter your new password"
                      : "Leave blank to keep current password"
                  }
                  required={passwordResetMode}
                  autoComplete="new-password"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-900 transition hover:bg-emerald-400"
              >
                {saving
                  ? "Saving…"
                  : passwordResetMode
                    ? "Update Password"
                    : "Save Changes"}
              </button>
            </form>
          )}
        </div>

        {canManageOrganization && !passwordResetMode && (
          <>
          {settingsMode && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Organization Details</h2>
            <p className="text-sm text-slate-400">
              Update the registered organization name, KRA PIN, and base currency.
            </p>
            <form onSubmit={handleOrganizationSave} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-slate-400">
                  Organization Name
                </label>
                <input
                  name="name"
                  value={organizationForm.name}
                  onChange={handleOrganizationChange}
                  maxLength={255}
                  required
                  className="w-full rounded border border-slate-800 bg-slate-950 p-3 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-slate-400">
                  Organization KRA PIN
                </label>
                <input
                  name="kra_pin"
                  value={organizationForm.kra_pin}
                  onChange={handleOrganizationChange}
                  maxLength={11}
                  placeholder="A123456789B"
                  autoCapitalize="characters"
                  required
                  className="w-full rounded border border-slate-800 bg-slate-950 p-3 text-sm text-white uppercase"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-slate-400">
                  Base Currency
                </label>
                <select
                  name="currency"
                  value={organizationForm.currency}
                  onChange={handleOrganizationChange}
                  className="w-full rounded border border-slate-800 bg-slate-950 p-3 text-sm text-white"
                >
                  <option value="Ksh">Ksh</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={savingOrganization || !organization}
                className="w-full rounded-2xl px-4 py-3 text-slate-900 font-semibold transition disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {savingOrganization ? "Saving…" : "Save Organization Details"}
              </button>
            </form>
          </div>
          )}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Organization Theme Color</h2>
            <p className="text-sm text-slate-400">
              Choose the primary color used across your organization workspace.
            </p>
            <form onSubmit={handleThemeSave} className="space-y-4">
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={organizationColor}
                  onChange={(event) => setOrganizationColor(event.target.value)}
                  className="h-14 w-16 cursor-pointer rounded-lg border border-slate-700 bg-slate-950 p-1"
                  aria-label="Organization theme color"
                />
                <input
                  value={organizationColor}
                  onChange={(event) => setOrganizationColor(event.target.value)}
                  pattern="^#[0-9a-fA-F]{6}$"
                  maxLength={7}
                  className="w-32 rounded bg-slate-950 border border-slate-800 p-3 text-sm text-white uppercase"
                  aria-label="Theme color hex value"
                />
                <span className="h-10 flex-1 rounded-lg" style={{ backgroundColor: organizationColor }} />
              </div>
              <button
                type="submit"
                disabled={savingTheme || !organization}
                className="w-full rounded-2xl px-4 py-3 text-slate-900 font-semibold transition disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {savingTheme ? "Saving…" : "Save Organization Theme"}
              </button>
            </form>
          </div>
          </>
        )}

        {!passwordResetMode && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white">
            Employment Summary
          </h2>
          <div className="text-slate-300 text-sm space-y-3">
            <div>
              <span className="font-semibold">Department:</span>{" "}
              {profile.payroll_profile?.department_name || "N/A"}
            </div>
            <div>
              <span className="font-semibold">Employee ID:</span>{" "}
              {profile.payroll_profile?.employee_id || "N/A"}
            </div>
            <div>
              <span className="font-semibold">Joined:</span>{" "}
              {profile.payroll_profile?.joining_date || "N/A"}
            </div>
            <div>
              <span className="font-semibold">Bank:</span>{" "}
              {profile.payroll_profile?.bank_name || "N/A"}
            </div>
          </div>
          <div className="pt-4 border-t border-slate-800">
            <a
              href="#"
              className="inline-flex rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition"
            >
              Request Payslip
            </a>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
