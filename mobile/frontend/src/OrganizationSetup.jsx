// frontend/src/OrganizationSetup.jsx
import React, { useState } from "react";
import API from "./api";

export default function OrganizationSetup({ onSetupComplete }) {
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await API.post("organization/", { name, tax_id: taxId, currency });
      onSetupComplete();
    } catch (err) {
      setError("Failed to initialize organization profile.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-md">
        <h2 className="text-2xl font-black text-white mb-2">
          Initialize Organization
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          Before onboarding employees, register your corporate profile.
        </p>

        {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Company Name
            </label>
            <input
              type="text"
              className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Tax Registration / EIN
            </label>
            <input
              type="text"
              className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white outline-none"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Base Currency
            </label>
            <select
              className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-400 outline-none"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="USD">USD ($)</option>
              <option value="KSH">KSH (KSh)</option>

              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="INR">INR (₹)</option>
            </select>
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg font-bold transition"
          >
            Create Organization
          </button>
        </form>
      </div>
    </div>
  );
}
