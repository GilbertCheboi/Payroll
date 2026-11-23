// frontend/src/HRManagement.jsx
import React, { useState, useEffect } from "react";
import API from "./api";

export default function HRManagement() {
  const [hrManagers, setHrManagers] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  const fetchHRManagers = async () => {
    try {
      // Request filtered down exclusively to users with HR roles
      const res = await API.get("accounts/?role=HR");

      // DEFENSIVE: Safely parse API responses into arrays.
      // Handles raw lists, DRF paginated shapes (.results), or payload envelopes (.data).
      const managersData = Array.isArray(res.data)
        ? res.data
        : res.data?.results || res.data?.data || [];

      setHrManagers(managersData);
    } catch (err) {
      console.error("Failed to load HR profiles.", err);
    }
  };

  useEffect(() => {
    fetchHRManagers();
  }, []);

  const handleOnboard = async (e) => {
    e.preventDefault();
    try {
      await API.post("accounts/", {
        username,
        password,
        first_name: firstName,
        last_name: lastName,
        email,
        role: "HR",
      });
      setUsername("");
      setPassword("");
      setFirstName("");
      setLastName("");
      setEmail("");
      setMsg("HR Specialist onboarded successfully!");
      fetchHRManagers();
    } catch (err) {
      setMsg("Error onboarding staff. Ensure username is globally unique.");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Onboarding Form Panel */}
      <form
        onSubmit={handleOnboard}
        className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 lg:col-span-1 h-fit shadow-md"
      >
        <h3 className="text-xl font-extrabold text-white">
          Onboard HR Specialist
        </h3>
        {msg && <p className="text-sm font-semibold text-emerald-300">{msg}</p>}

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Username"
            className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="First Name"
            className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm outline-none"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Last Name"
            className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm outline-none"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Email Address"
            className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-900 p-2.5 rounded-lg font-semibold text-sm shadow-sm transition"
        >
          Register Manager
        </button>
      </form>

      {/* Inventory Listing Display */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden lg:col-span-2 shadow-sm">
        <div className="p-4 bg-slate-800/50 border-b border-slate-800">
          <h4 className="font-extrabold text-white">Active HR Managers</h4>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <th className="p-4">Name</th>
              <th className="p-4">Username</th>
              <th className="p-4">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {!hrManagers || hrManagers.length === 0 ? (
              <tr>
                <td
                  colSpan="3"
                  className="p-4 text-center text-slate-500 text-sm"
                >
                  No specialized HR managers onboarded yet.
                </td>
              </tr>
            ) : (
              // SAFE GUARDED: Loop falls back to an empty array safely if state is unexpected
              (hrManagers || []).map((hr) => (
                <tr key={hr.id} className="hover:bg-slate-800/30 transition">
                  <td className="p-4 text-white font-medium">
                    {hr.first_name} {hr.last_name}
                  </td>
                  <td className="p-4 font-mono text-xs text-emerald-300">
                    @{hr.username}
                  </td>
                  <td className="p-4 text-slate-400 text-sm">{hr.email}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}