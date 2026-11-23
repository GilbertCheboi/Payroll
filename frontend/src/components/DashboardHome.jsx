import React, { useState, useEffect } from "react";
import API from "../api";

export default function DashboardHome({ userRole }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Normalize current role string for strict API querying parameters
  const activeRole = userRole?.toUpperCase() || "EMPLOYEE";

  useEffect(() => {
    const fetchDashboardMetrics = async () => {
      try {
        setLoading(true);
        const response = await API.get(
          `dashboard/summary/?view_as=${activeRole}`,
        );
        setMetrics(response.data.metrics);
      } catch (err) {
        console.error("Dashboard engine failure:", err);
        setError(
          "System synchronizer anomaly. Failed to resolve operations metrics.",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardMetrics();
  }, [activeRole]);

  if (loading) {
    return (
      <div className="space-y-8 p-2 animate-pulse">
        <div className="h-36 bg-slate-900 border border-slate-800 rounded-2xl w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="h-28 bg-slate-900 border border-slate-800 rounded-xl" />
          <div className="h-28 bg-slate-900 border border-slate-800 rounded-xl" />
          <div className="h-28 bg-slate-900 border border-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-950/20 border border-rose-900 text-rose-400 p-6 rounded-2xl text-center max-w-xl mx-auto mt-12">
        <p className="font-mono text-sm font-semibold">{error}</p>
      </div>
    );
  }

  // Check if current workspace terminal is running an Administrative view state
  const isManagement = ["ADMIN", "HR"].includes(activeRole);
  const formatMoney = (value) =>
    Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="space-y-8 animate-fadeIn text-white">
      {/* Welcome Banner */}
      <div className="bg-slate-900 p-8 rounded-2xl border border-slate-700 relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-3xl font-black text-slate-100 mb-2 tracking-tight">
            Welcome Back
          </h2>
          <p className="text-slate-400 max-w-xl text-sm leading-relaxed">
            {isManagement
              ? `Authorized clearance: ${activeRole} Profile active. Global infrastructure is fully operational. You have systemic permissions to execute payroll matrix cycles, override department tiers, and audit corporate tax IDs.`
              : "Your digital employee portal is fully encrypted. Review your historic monthly base payslips, request time off parameters, or view structural updates."}
          </p>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
      </div>

      {/* Dynamic Metrics Matrix Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {isManagement ? (
          <>
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-emerald-500/60 transition">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                Employees
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-100">
                  {metrics?.totalEmployees || 0}
                </span>
                <span className="text-xs text-emerald-400 font-medium">
                  Active Staff Profiles
                </span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-emerald-500/60 transition">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                Payroll Runs
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-100">
                  {metrics?.payrollRuns || 0}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  All cycles
                </span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-amber-400/60 transition">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                People on Leave
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-100">
                  {metrics?.peopleOnLeave || 0}
                </span>
                <span className="text-xs text-slate-500">
                  Currently approved
                </span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-emerald-500/60 transition">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                Paid Out
              </span>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black text-emerald-500">
                  {formatMoney(metrics?.paidOut)}
                </span>
                <span className="text-xs text-slate-500 font-mono">Ksh</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-emerald-500/60 transition">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                Gross Payroll
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-100">
                  {formatMoney(metrics?.monthlyGrossProcessing)}
                </span>
                <span className="text-xs text-slate-500 font-mono">Ksh</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-emerald-500/60 transition">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                Total Deductions
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-emerald-500">
                  {formatMoney(metrics?.totalDeductions)}
                </span>
                <span className="text-xs text-slate-500 font-mono">Ksh</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-amber-400/60 transition">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                Pending Cycles
              </span>
              <div className="flex items-baseline gap-3">
                <span
                  className={`text-3xl font-black ${metrics?.pendingCycles > 0 ? "text-amber-400" : "text-slate-400"}`}
                >
                  {metrics?.pendingCycles || 0}
                </span>
                <span className="text-xs text-slate-500">Needs processing</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Standard Employee Metric 1: Contract Baseline */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-slate-700 transition">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                Your Base Contract Pay
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-emerald-400">
                  Ksh{" "}
                  {(metrics?.baseContractPay || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  / Month
                </span>
              </div>
            </div>

            {/* Standard Employee Metric 2: Pay Schedule */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-slate-700 transition">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                Next Scheduled Payday
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-100">
                  {metrics?.nextPayday || "Pending"}
                </span>
              </div>
            </div>

            {/* Standard Employee Metric 3: Leave Accruals Monitor */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-slate-700 transition">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                Accrued Paid Leave Balance
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-100">
                  {metrics?.leaveBalance || "0.0"}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  Days Available
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
