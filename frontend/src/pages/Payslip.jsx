import React, { useRef, useState, useEffect } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import API from "../api";

export default function Payslip() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [employeeData, setEmployeeData] = useState(null);
  const [payrollRecords, setPayrollRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const printRef = useRef(null);

  useEffect(() => {
    const fetchPayslipData = async () => {
      try {
        setLoading(true);

        const [profileRes, recordsRes] = await Promise.all([
          API.get("employees/me/"),
          API.get("payroll-records/me/"),
        ]);

        setEmployeeData(profileRes.data);
        setPayrollRecords(recordsRes.data || []);

        // Default to the most recent run
        if (recordsRes.data && recordsRes.data.length > 0) {
          setSelectedRecord(recordsRes.data[0]);
        }
      } catch (err) {
        console.error("Error fetching payroll data:", err);
        setError(
          "Failed to load your payslip information. Please try again later.",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchPayslipData();
  }, []);

  const handlePeriodChange = (e) => {
    const recordId = Number(e.target.value);
    const record = payrollRecords.find((r) => r.id === recordId);
    if (record) {
      setSelectedRecord(record);
    }
  };

  const handleDownload = async () => {
    if (!selectedRecord) return;
    setIsDownloading(true);
    const element = printRef.current;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#050b14",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save(
        `Payslip_${selectedRecord.employee_name || "Employee"}_${selectedRecord.payroll_run_name || "Period"}.pdf`,
      );
    } catch (err) {
      console.error("Failed to generate PDF", err);
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-emerald-500 mx-auto mb-4"></div>
        Loading your payroll history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-rose-400 bg-rose-950/20 border border-rose-900 rounded-3xl max-w-2xl mx-auto mt-10">
        <p className="font-semibold">{error}</p>
      </div>
    );
  }

  if (payrollRecords.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900/50 border border-slate-800 rounded-3xl max-w-2xl mx-auto mt-10">
        <h2 className="text-xl font-bold text-white mb-2">No Payslips Found</h2>
        <p>
          There are currently no processed payroll records for your profile in
          this organization.
        </p>
      </div>
    );
  }

  // Exact mappings to your Django serializer fields
  const basicSalary = Number(selectedRecord?.basic_salary || 0);
  const totalAllowance = Number(selectedRecord?.total_allowance || 0);
  const grossPay = Number(selectedRecord?.gross_pay || 0);

  // Statutory Deductions
  const payeTax = Number(selectedRecord?.paye_tax || 0);
  const shaDeduction = Number(selectedRecord?.sha_deduction || 0);
  const nssfDeduction = Number(selectedRecord?.nssf_deduction || 0);
  const housingLevy = Number(selectedRecord?.housing_levy_deduction || 0);
  const helbDeduction = Number(selectedRecord?.helb_deduction || 0);

  // SACCO Deductions
  const saccoContribution = Number(
    selectedRecord?.sacco_contribution_deduction || 0,
  );
  const saccoRepayment = Number(selectedRecord?.sacco_repayment_deduction || 0);

  // Totals
  const totalDeductions = Number(selectedRecord?.total_deductions || 0);
  const netPay = Number(selectedRecord?.net_pay || 0);

  return (
    <div className="p-8 space-y-6 text-white max-w-6xl mx-auto">
      {/* HEADER SECTION */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
        <div className="flex items-center justify-between gap-6 flex-col md:flex-row">
          <div>
            <h1 className="text-3xl font-black text-white">Payslip Center</h1>
            <p className="text-slate-400 mt-1">
              Select a pay period to review or download your official salary
              statements.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center w-full md:w-auto">
            {/* PAYROLL RUN SELECTOR */}
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Select Pay Period
              </label>
              <select
                value={selectedRecord?.id || ""}
                onChange={handlePeriodChange}
                className="bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500 transition cursor-pointer"
              >
                {payrollRecords.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.payroll_run_name ||
                      `Period ID: ${record.payroll_run}`}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="rounded-2xl bg-emerald-500 px-5 py-3 text-slate-900 font-bold hover:bg-emerald-400 disabled:opacity-55 transition self-end h-[46px] w-full sm:w-auto"
            >
              {isDownloading
                ? "Generating PDF..."
                : "Download Selected Payslip"}
            </button>
          </div>
        </div>
      </div>

      {/* DASHBOARD DISPLAY GRID */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Dynamic Pay Summary Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg">
          <h2 className="text-lg font-semibold text-white">
            Selected Period Summary
          </h2>
          <div className="text-slate-300 text-sm space-y-3">
            <div className="flex justify-between">
              <span>Pay Period</span>
              <span className="font-semibold text-white">
                {selectedRecord?.payroll_run_name || "N/A"}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-800 pt-3">
              <span>Basic Salary</span>
              <span className="font-semibold text-white">
                Ksh {basicSalary.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Total Allowance</span>
              <span className="font-semibold text-emerald-500">
                +Ksh {totalAllowance.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-3">
              <span>Gross Pay</span>
              <span className="font-semibold text-emerald-400">
                Ksh {grossPay.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Total Deductions</span>
              <span className="font-semibold text-rose-400">
                -Ksh {totalDeductions.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-800 pt-3 text-base">
              <span className="text-white">Net Take-Home Pay</span>
              <span className="font-black text-white">
                Ksh {netPay.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Breakdown Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg">
          <h2 className="text-lg font-semibold text-white">
            Kenya Statutory & SACCO Breakdown
          </h2>
          <div className="space-y-3 text-slate-300 text-sm">
            <div className="flex justify-between">
              <span>PAYE Tax</span>
              <span className="font-semibold text-rose-300">
                -Ksh {payeTax.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Social Health Authority (SHA)</span>
              <span className="font-semibold text-rose-300">
                -Ksh {shaDeduction.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>NSSF Pension Contribution</span>
              <span className="font-semibold text-rose-300">
                -Ksh {nssfDeduction.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Housing Levy</span>
              <span className="font-semibold text-rose-300">
                -Ksh {housingLevy.toFixed(2)}
              </span>
            </div>
            {helbDeduction > 0 && (
              <div className="flex justify-between">
                <span>HELB Loan Deduction</span>
                <span className="font-semibold text-rose-300">
                  -Ksh {helbDeduction.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-800 pt-3">
              <span>SACCO Monthly Contribution</span>
              <span className="font-semibold text-rose-400">
                -Ksh {saccoContribution.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>SACCO Loan Repayment</span>
              <span className="font-semibold text-rose-400">
                -Ksh {saccoRepayment.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* EXPORTABLE DYNAMIC TEMPLATE (HIDDEN OFF-SCREEN) */}
      <div className="absolute left-[-9999px] top-0">
        <div
          ref={printRef}
          className="w-[800px] p-12 bg-slate-950 text-white font-sans space-y-8"
        >
          {/* Document Header */}
          <div className="flex justify-between items-start border-b border-slate-800 pb-8">
            <div>
              <h2 className="text-xs uppercase tracking-widest text-emerald-500 font-bold">
                Official Payslip Statement
              </h2>
              <h1 className="text-3xl font-black mt-1">
                {selectedRecord?.organization_name || "Organization"}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {selectedRecord?.organization_kra_pin
                  ? `KRA PIN: ${selectedRecord.organization_kra_pin}`
                  : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase">Pay Period</p>
              <p className="text-md font-bold text-white mt-1">
                {selectedRecord?.payroll_run_name}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Generated securely on {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Employee Info Block */}
          <div className="grid grid-cols-2 gap-8 bg-slate-900/50 p-6 rounded-2xl border border-slate-800/80">
            <div>
              <p className="text-xs text-slate-400 uppercase">
                Employee Details
              </p>
              <h3 className="text-lg font-bold mt-1">
                {selectedRecord?.employee_name}
              </h3>
              <p className="text-sm text-slate-400">
                ID: {selectedRecord?.employee_id || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Department</p>
              <h3 className="text-lg font-bold mt-1">
                {selectedRecord?.department_name || "N/A"}
              </h3>
              <p className="text-sm text-slate-400">
                Payslip Ref: #{selectedRecord?.id}
              </p>
            </div>
          </div>

          {/* Earnings & Deductions Details */}
          <div className="grid grid-cols-2 gap-8">
            {/* Earnings */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 border-b border-slate-800 pb-2">
                Earnings
              </h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Basic Salary</span>
                  <span className="font-semibold">
                    Ksh {basicSalary.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Allowances</span>
                  <span className="font-semibold">
                    +Ksh {totalAllowance.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-900 pt-2 font-bold text-white">
                  <span>Gross Pay</span>
                  <span>Ksh {grossPay.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 border-b border-slate-800 pb-2">
                Deductions
              </h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">PAYE Tax</span>
                  <span className="font-semibold">
                    -Ksh {payeTax.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">SHA Deduction</span>
                  <span className="font-semibold">
                    -Ksh {shaDeduction.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">NSSF Deduction</span>
                  <span className="font-semibold">
                    -Ksh {nssfDeduction.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Housing Levy</span>
                  <span className="font-semibold">
                    -Ksh {housingLevy.toFixed(2)}
                  </span>
                </div>
                {helbDeduction > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">HELB Deduction</span>
                    <span className="font-semibold">
                      -Ksh {helbDeduction.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-900 pt-2">
                  <span className="text-slate-400">SACCO Contribution</span>
                  <span className="font-semibold">
                    -Ksh {saccoContribution.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">SACCO Loan Repayment</span>
                  <span className="font-semibold">
                    -Ksh {saccoRepayment.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Summary/Totals Block */}
          <div className="border-t border-slate-800 pt-6 flex justify-between items-center">
            <div>
              <p className="text-xs text-slate-500 uppercase">Payment Method</p>
              <p className="text-sm font-semibold text-slate-300">
                Direct Bank Transfer
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-right min-w-[200px]">
              <p className="text-xs text-emerald-400 uppercase font-bold">
                Net Take-Home Pay
              </p>
              <p className="text-3xl font-black text-white mt-1">
                Ksh {netPay.toFixed(2)}
              </p>
            </div>
          </div>

          {/* System Footer */}
          <div className="text-center pt-8 border-t border-slate-900">
            <p className="text-xs text-slate-500">
              This is a system-generated document. Security Hash:{" "}
              {selectedRecord?.id
                ? String(selectedRecord.id).slice(0, 8)
                : "N/A"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
