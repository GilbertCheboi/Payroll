import React from "react";
import Layout from "../components/Layout";

export default function Landing({ onGetStarted, onLogin }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl font-extrabold">PayrollMatrix</h1>
        <p className="mt-4 text-slate-300 max-w-2xl mx-auto">
          Modern payroll for teams — multi-tenant, secure, auditable.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={onGetStarted}
            className="bg-emerald-500 text-slate-900 px-6 py-3 rounded-lg font-semibold"
          >
            Sign Up
          </button>
          <button
            onClick={onLogin}
            className="border border-slate-700 px-6 py-3 rounded-lg text-slate-300"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
