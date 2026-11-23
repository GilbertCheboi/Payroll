import React, { useState, useEffect } from "react";
import API from "../api";

export default function Reports() {
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState("");
  const [reportType, setReportType] = useState("bank"); // default to 'bank'
  const [selectedTarget, setSelectedTarget] = useState("");
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Broad organizational lookup lists for your filter criteria dropdowns
  const bankOptions = [
    "Equity Bank",
    "KCB Bank",
    "Co-operative Bank",
    "Absa Bank",
    "Standard Chartered",
  ];
  const saccoOptions = [
    "Stima Sacco",
    "Harambee Sacco",
    "Kenya Police Sacco",
    "Mwalimu National Sacco",
  ];

  useEffect(() => {
    // Fetch available execution runs to populate target payroll cycle selector
    const fetchRuns = async () => {
      try {
        const response = await API.get("payroll-runs/");
        setPayrollRuns(response.data.results || response.data);
        if (response.data.length > 0) {
          setSelectedRun(response.data[0].id);
        }
      } catch (err) {
        console.error("Failed to load payroll cycle configurations", err);
      }
    };
    fetchRuns();
  }, []);

  const generateReport = async () => {
    if (!selectedRun) return;
    try {
      setLoading(true);
      const targetParam = selectedTarget
        ? `&target=${encodeURIComponent(selectedTarget)}`
        : "";
      const response = await API.get(
        `reports/financial/?payroll_run_id=${selectedRun}&type=${reportType}${targetParam}`,
      );
      setReportData(response.data.data);
    } catch (err) {
      console.error("Report extraction engine anomaly:", err);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (reportData.length === 0) return;

    let headers =
      reportType === "bank"
        ? [
            "Employee ID",
            "Employee Name",
            "Bank Name",
            "Account Number",
            "Net Payable Remittance (Ksh)",
          ]
        : [
            "Employee ID",
            "Employee Name",
            "Sacco Monthly Contribution",
            "Sacco Loan Repayment",
            "Total Remittance",
          ];

    let csvRows = [headers.join(",")];

    reportData.forEach((row) => {
      const values =
        reportType === "bank"
          ? [
              row.employee_id,
              `"${row.name}"`,
              row.bank_name,
              row.bank_account,
              row.amount,
            ]
          : [
              row.employee_id,
              `"${row.name}"`,
              row.sacco_contribution,
              row.sacco_repayment,
              row.total_deduction,
            ];
      csvRows.push(values.join(","));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `${reportType}_schedule_cycle_${selectedRun}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 text-slate-100 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-2xl font-black tracking-tight">
            Institutional Remittance Center
          </h2>
          <p className="text-xs text-slate-400">
            Compile and export secure financial balance matrix schedules for
            banks and Saccos.
          </p>
        </div>
      </div>

      {/* Filter Parameters Control Console */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800 text-sm">
        {/* Payroll Cycle Select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Payroll Execution Run
          </label>
          <select
            className="bg-slate-900 border border-slate-800 rounded p-2 text-white outline-none focus:border-slate-700"
            value={selectedRun}
            onChange={(e) => {
              setSelectedRun(e.target.value);
              setReportData([]);
            }}
          >
            <option value="">Select Target Run</option>
            {payrollRuns.map((run) => (
              <option key={run.id} value={run.id}>
                {run.name || `Cycle: ${run.start_date}`}
              </option>
            ))}
          </select>
        </div>

        {/* Core Classification Type */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Report Category
          </label>
          <select
            className="bg-slate-900 border border-slate-800 rounded p-2 text-white outline-none focus:border-slate-700"
            value={reportType}
            onChange={(e) => {
              setReportType(e.target.value);
              setSelectedTarget("");
              setReportData([]);
            }}
          >
            <option value="bank">Bank Remittance Schedule</option>
            <option value="sacco">Sacco Deductions Summary</option>
          </select>
        </div>

        {/* Dynamic Context Destination Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {reportType === "bank"
              ? "Target Bank Clearing House"
              : "Target Sacco Association"}
          </label>
          <select
            className="bg-slate-900 border border-slate-800 rounded p-2 text-white outline-none focus:border-slate-700"
            value={selectedTarget}
            onChange={(e) => {
              setSelectedTarget(e.target.value);
              setReportData([]);
            }}
          >
            <option value="">All Systems Combined</option>
            {reportType === "bank"
              ? bankOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))
              : saccoOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
          </select>
        </div>

        {/* Actions Execution Block */}
        <div className="flex items-end gap-2">
          <button
            onClick={generateReport}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-bold py-2 px-4 rounded transition"
            disabled={loading}
          >
            {loading ? "Compiling..." : "Compile Matrix"}
          </button>
          {reportData.length > 0 && (
            <button
              onClick={downloadCSV}
              className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-4 rounded border border-slate-700 transition"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Render Compiled Output Matrix Data Grid Table */}
      {reportData.length > 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-xs uppercase tracking-wider">
                <th className="p-4">Staff Ref</th>
                <th className="p-4">Full Identity Name</th>
                {reportType === "bank" ? (
                  <>
                    <th className="p-4">Financier</th>
                    <th className="p-4">Account Number</th>
                    <th className="p-4 text-right">Net Value Allocation</th>
                  </>
                ) : (
                  <>
                    <th className="p-4 text-right">Contribution</th>
                    <th className="p-4 text-right">Repayment Due</th>
                    <th className="p-4 text-right">Aggregated Net Outflow</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {reportData.map((row, index) => (
                <tr key={index} className="hover:bg-slate-850/40 transition">
                  <td className="p-4 text-slate-400">{row.employee_id}</td>
                  <td className="p-4 font-sans font-semibold text-slate-200">
                    {row.name}
                  </td>
                  {reportType === "bank" ? (
                    <>
                      <td className="p-4 text-slate-300">{row.bank_name}</td>
                      <td className="p-4 text-slate-400">{row.bank_account}</td>
                      <td className="p-4 text-right font-bold text-emerald-400">
                        Ksh{" "}
                        {row.amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-4 text-right text-slate-300">
                        Ksh {row.sacco_contribution.toLocaleString()}
                      </td>
                      <td className="p-4 text-right text-slate-300">
                        Ksh {row.sacco_repayment.toLocaleString()}
                      </td>
                      <td className="p-4 text-right font-bold text-amber-400">
                        Ksh {row.total_deduction.toLocaleString()}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-dashed border-slate-800 bg-slate-900/30 text-center p-12 rounded-xl text-slate-500 text-sm">
          No generated schedule ledger records are currently loaded in this
          active session context view. Select a target cycle and trigger
          compilation above.
        </div>
      )}
    </div>
  );
}
