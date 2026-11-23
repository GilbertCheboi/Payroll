// frontend/src/Payroll.jsx
import React, { useEffect, useState, useRef } from "react";
import API from "../api";

export default function Payroll() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");
  const [expandedRuns, setExpandedRuns] = useState({});
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);

  const loadPayrollRuns = async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await API.get("payroll-runs/");

      // DEFENSIVE: Safely unpack API payloads into arrays.
      const runsData = Array.isArray(response.data)
        ? response.data
        : response.data?.results || response.data?.data || [];

      setRuns(runsData);
    } catch (err) {
      console.error(err);
      setMessage("Unable to load payroll runs. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayrollRuns();
  }, []);

  const createRun = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await API.post("payroll-runs/", {
        name,
        start_date: startDate,
        end_date: endDate,
      });
      setName("");
      setStartDate("");
      setEndDate("");
      await loadPayrollRuns();
      setMessage("Payroll run created. You can now process it.");
    } catch (err) {
      console.error(err);
      setMessage("Failed to create payroll run.");
    }
  };

  const processRun = async (id) => {
    setMessage("");
    try {
      await API.post(`payroll-runs/${id}/process/`);
      await loadPayrollRuns();
      setMessage("Payroll run processed successfully.");
    } catch (err) {
      console.error(err);
      setMessage("Unable to process payroll run. It must be Draft.");
    }
  };

  const deleteRun = async (run) => {
    if (!window.confirm(`Delete ${run.name}? This will also remove its attached payroll records.`)) {
      return;
    }

    setMessage("");
    try {
      await API.delete(`payroll-runs/${run.id}/`);
      await loadPayrollRuns();
      setMessage("Payroll run and attached records deleted successfully.");
    } catch (err) {
      console.error(err);
      setMessage("Unable to delete payroll run.");
    }
  };

  const toggleRunRecords = (runId) => {
    setExpandedRuns((current) => ({
      ...current,
      [runId]: !current[runId],
    }));
  };

  // Helper function to safely format monetary values
  const formatCurrency = (val) => {
    if (val === null || val === undefined || val === "") return "-";
    const num = parseFloat(val);
    return isNaN(num)
      ? "-"
      : num.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  };

  return (
    <div className="p-8 space-y-6 text-white max-w-7xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
        <h1 className="text-3xl font-black text-white">Payroll Management</h1>
        <p className="text-slate-400 mt-2 text-sm">
          Create payroll runs, process them, and review employee payout records.
        </p>
      </div>

      {message && (
        <div className="rounded-3xl border border-slate-800 bg-emerald-500/10 p-4 text-emerald-300 font-semibold text-sm">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        {/* Onboarding Run Form */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
            New Payroll Run
          </h2>
          <form onSubmit={createRun} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-[0.24em] text-slate-400 mb-1 font-bold">
                Run Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-2xl bg-slate-950 border border-slate-800 p-3 text-white text-sm outline-none focus:border-blue-500"
                placeholder="e.g., January 2026 Payroll Run"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.24em] text-slate-400 mb-1 font-bold">
                Start Date
              </label>
              <input
                ref={startDateRef}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                onClick={() =>
                  startDateRef.current?.showPicker?.() ??
                  startDateRef.current?.focus()
                }
                onFocus={() =>
                  startDateRef.current?.showPicker?.() ??
                  startDateRef.current?.focus()
                }
                required
                className="w-full rounded-2xl bg-slate-950 border border-slate-800 p-3 text-white text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.24em] text-slate-400 mb-1 font-bold">
                End Date
              </label>
              <input
                ref={endDateRef}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onClick={() =>
                  endDateRef.current?.showPicker?.() ??
                  endDateRef.current?.focus()
                }
                onFocus={() =>
                  endDateRef.current?.showPicker?.() ??
                  endDateRef.current?.focus()
                }
                required
                className="w-full rounded-2xl bg-slate-950 border border-slate-800 p-3 text-white text-sm outline-none"
              />
            </div>
            <button className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-900 hover:bg-emerald-400 transition shadow-lg">
              Create Run
            </button>
          </form>
        </section>

        {/* Directory Ledger List */}
        <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">
            Payroll Runs
          </h2>
          {loading ? (
            <div className="text-slate-400 mt-6 text-center py-12 animate-pulse text-sm">
              Loading payroll runs…
            </div>
          ) : !runs || runs.length === 0 ? (
            <div className="text-slate-500 mt-6 text-center py-12 text-sm">
              No payroll runs yet. Start by creating one.
            </div>
          ) : (
            <div className="space-y-6 mt-6">
              {(runs || []).map((run) => (
                <div
                  key={run.id}
                  className="rounded-3xl border border-slate-800 bg-slate-950 p-6 space-y-4 shadow-md"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        {run.name}
                      </h3>
                      <p className="text-slate-500 text-xs font-mono">
                        {run.start_date} &rarr; {run.end_date}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-xs text-slate-300 font-semibold tracking-wider uppercase">
                        {run.status}
                      </span>
                      <span className="rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-xs text-slate-300 font-semibold">
                        {run.record_count || 0} records
                      </span>
                      {run.status === "DRAFT" && (
                        <button
                          onClick={() => processRun(run.id)}
                          className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition shadow-md"
                        >
                          Process
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteRun(run)}
                        className="rounded-xl bg-red-500/10 px-4 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Nested payroll records */}
                  {run.records && run.records.length > 0 && (
                    <div className="mt-4 overflow-x-auto border border-slate-850 rounded-2xl bg-slate-900/50">
                      <table className="min-w-full text-left text-xs text-slate-300 border-collapse">
                        <thead>
                          <tr className="border-b border-slate-850 bg-slate-950 text-slate-400 font-bold uppercase tracking-wider">
                            <th className="p-3">Employee</th>
                            <th className="p-3">Dept</th>
                            <th className="p-3 text-right">Basic Sal</th>
                            <th className="p-3 text-right">Allowance</th>
                            <th className="p-3 text-right">NSSF</th>
                            <th className="p-3 text-right">SHA</th>
                            <th className="p-3 text-right">Housing Levy</th>
                            <th className="p-3 text-right">PAYE (KRA)</th>
                            <th className="p-3 text-right">HELB</th>
                            <th className="p-3 text-right">Sacco Cont.</th>
                            <th className="p-3 text-right">Sacco Repay.</th>
                            <th className="p-3 text-right">Total Ded.</th>
                            <th className="p-3 text-right text-emerald-400">
                              Gross
                            </th>
                            <th className="p-3 text-right text-emerald-300">
                              Net
                            </th>
                            <th className="p-3 text-center">Paid</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850">
                          {run.records
                            .slice(0, expandedRuns[run.id] ? undefined : 5)
                            .map((record) => (
                              <tr
                                key={record.id}
                                className="hover:bg-slate-950/40 transition duration-100"
                              >
                                <td className="p-3 font-semibold text-white">
                                  {record.employee_name ||
                                    record.employee_id ||
                                    "Unknown"}
                                </td>
                                <td className="p-3 text-slate-400">
                                  {record.department_name || "-"}
                                </td>
                                {/* Match to your updated serializer mapping keys */}
                                <td className="p-3 text-right font-mono">
                                  {formatCurrency(record.basic_salary)}
                                </td>
                                <td className="p-3 text-right font-mono">
                                  {formatCurrency(record.total_allowance)}
                                </td>
                                <td className="p-3 text-right font-mono text-amber-500/90">
                                  {formatCurrency(record.nssf_deduction)}
                                </td>
                                <td className="p-3 text-right font-mono text-amber-500/90">
                                  {formatCurrency(record.sha_deduction)}
                                </td>
                                <td className="p-3 text-right font-mono text-amber-500/90">
                                  {formatCurrency(
                                    record.housing_levy_deduction,
                                  )}
                                </td>
                                <td className="p-3 text-right font-mono text-amber-500/90">
                                  {formatCurrency(record.paye_tax)}
                                </td>
                                <td className="p-3 text-right font-mono text-amber-500/90">
                                  {formatCurrency(record.helb_deduction)}
                                </td>
                                <td className="p-3 text-right font-mono">
                                  {formatCurrency(record.sacco_contribution)}
                                </td>
                                <td className="p-3 text-right font-mono">
                                  {formatCurrency(record.sacco_repayment)}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-red-400">
                                  {formatCurrency(record.total_deductions)}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-400">
                                  {formatCurrency(record.gross_pay)}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-300">
                                  {formatCurrency(record.net_pay)}
                                </td>
                                <td className="p-3 text-center font-bold">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded text-[10px] ${record.paid ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}
                                  >
                                    {record.paid ? "Yes" : "No"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {run.records.length > 5 && (
                        <div className="flex flex-col items-center gap-2 border-t border-slate-850 bg-slate-950/20 p-3 text-center">
                          <p className="text-xs font-semibold text-slate-500">
                            {expandedRuns[run.id]
                              ? `Showing all ${run.records.length} records.`
                              : `Showing first 5 entries of ${run.records.length} records.`}
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleRunRecords(run.id)}
                            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:border-emerald-500 hover:text-emerald-300 transition"
                          >
                            {expandedRuns[run.id]
                              ? "Show fewer records"
                              : `Show all ${run.records.length} records`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
