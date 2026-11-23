import React, { useRef, useState, useEffect } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import API from "../api";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function P9Certificate() {
  const [selectedYear, setSelectedYear] = useState("2026");
  const [p9Records, setP9Records] = useState([]);
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const printRef = useRef(null);

  // Fetch P9 data whenever the selected year changes
  useEffect(() => {
    const fetchP9Data = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch both profile details and year-specific payrolls
        const [profileRes, p9Res] = await Promise.all([
          API.get("employees/me/"),
          API.get(`payroll-records/p9/?year=${selectedYear}`),
        ]);

        setEmployeeProfile(profileRes.data);

        // Group payroll records by the payroll period, not when the record was created.
        const rawRecords = p9Res.data || [];
        const recordsByMonth = rawRecords.reduce((grouped, record) => {
          const month = Number(record.payroll_start_date?.split("-")[1]);
          if (month >= 1 && month <= 12) {
            grouped[month - 1].push(record);
          }
          return grouped;
        }, Array.from({ length: 12 }, () => []));

        const structuredMonths = Array.from({ length: 12 }, (_, i) => {
          const records = recordsByMonth[i];
          const sum = (field) =>
            records.reduce((total, record) => total + Number(record[field] || 0), 0);

          return {
            monthName: MONTH_NAMES[i],
            basicSalary: sum("basic_salary"),
            allowance: sum("total_allowance"),
            grossPay: sum("gross_pay"),
            nssf: sum("nssf_deduction"),
            sha: sum("sha_deduction"),
            housingLevy: sum("housing_levy_deduction"),
            // Standard KRA personal relief is Ksh 2,400 monthly for active tax payers
            personalRelief: records.length > 0 ? 2400 : 0,
            paye: sum("paye_tax"),
            netPay: sum("net_pay"),
          };
        });

        setP9Records(structuredMonths);
      } catch (err) {
        console.error("Error fetching P9 data:", err);
        setError(
          "Failed to generate P9 card for this year. Ensure payroll is processed.",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchP9Data();
  }, [selectedYear]);

  // Calculate annual columns totals
  const totals = p9Records.reduce(
    (acc, m) => {
      acc.basicSalary += m.basicSalary;
      acc.allowance += m.allowance;
      acc.grossPay += m.grossPay;
      acc.nssf += m.nssf;
      acc.sha += m.sha;
      acc.housingLevy += m.housingLevy;
      acc.personalRelief += m.personalRelief;
      acc.paye += m.paye;
      acc.netPay += m.netPay;
      return acc;
    },
    {
      basicSalary: 0,
      allowance: 0,
      grossPay: 0,
      nssf: 0,
      sha: 0,
      housingLevy: 0,
      personalRelief: 0,
      paye: 0,
      netPay: 0,
    },
  );

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    const element = printRef.current;
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      const employeeName = [employeeProfile?.first_name, employeeProfile?.last_name]
        .filter(Boolean)
        .join(" ");
      pdf.save(
        `KRA_P9_Form_${selectedYear}_${employeeName || "Employee"}.pdf`,
      );
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="p-8 space-y-6 text-white max-w-6xl mx-auto">
      {/* HEADER CARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black">KRA P9 Tax Card</h1>
            <p className="text-slate-400 mt-1">
              Generate and download your official KRA Tax Deduction Certificate
              for annual tax filing.
            </p>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-400 uppercase">
                Tax Year
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500 transition cursor-pointer"
              >
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
              </select>
            </div>
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading || loading}
              className="rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold px-5 py-3 mt-5 transition disabled:opacity-50"
            >
              {isDownloading ? "Saving P9..." : "Download P9 Form"}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-emerald-500 mx-auto mb-4"></div>
          Compiling your annual tax records...
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-400 bg-rose-950/10 border border-rose-900/50 rounded-2xl">
          {error}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 overflow-x-auto shadow-lg">
          <h3 className="text-lg font-bold mb-4">
            Preview: Tax Year {selectedYear}
          </h3>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
            <span className="font-semibold text-white">Employer KRA PIN:</span>{" "}
            {employeeProfile?.organization_kra_pin || "Not provided"}
          </div>

          {/* Scrollable table view inside dashboard */}
          <table className="w-full text-left border-collapse text-xs text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-2">Month</th>
                <th className="py-3 px-2 text-right">Basic Salary</th>
                <th className="py-3 px-2 text-right">Allowances</th>
                <th className="py-3 px-2 text-right">Gross Pay</th>
                <th className="py-3 px-2 text-right">NSSF</th>
                <th className="py-3 px-2 text-right">SHA (2.75%)</th>
                <th className="py-3 px-2 text-right">Housing Levy</th>
                <th className="py-3 px-2 text-right">Personal Relief</th>
                <th className="py-3 px-2 text-right">PAYE Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {p9Records.map((m, index) => (
                <tr key={index} className="hover:bg-slate-950/20">
                  <td className="py-3 px-2 font-semibold text-white">
                    {m.monthName}
                  </td>
                  <td className="py-3 px-2 text-right">
                    Ksh {m.basicSalary.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-right">
                    Ksh {m.allowance.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-right font-bold text-slate-200">
                    Ksh {m.grossPay.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-right text-rose-300">
                    Ksh {m.nssf.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-right text-rose-300">
                    Ksh {m.sha.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-right text-rose-300">
                    Ksh {m.housingLevy.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-right text-emerald-400">
                    Ksh {m.personalRelief.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-right text-rose-400 font-semibold">
                    Ksh {m.paye.toFixed(2)}
                  </td>
                </tr>
              ))}
              {/* Year Totals Row */}
              <tr className="bg-slate-950/50 font-bold border-t border-slate-700 text-white">
                <td className="py-4 px-2 uppercase">Total (A-K)</td>
                <td className="py-4 px-2 text-right">
                  Ksh {totals.basicSalary.toFixed(2)}
                </td>
                <td className="py-4 px-2 text-right">
                  Ksh {totals.allowance.toFixed(2)}
                </td>
                <td className="py-4 px-2 text-right text-emerald-400">
                  Ksh {totals.grossPay.toFixed(2)}
                </td>
                <td className="py-4 px-2 text-right text-rose-300">
                  Ksh {totals.nssf.toFixed(2)}
                </td>
                <td className="py-4 px-2 text-right text-rose-300">
                  Ksh {totals.sha.toFixed(2)}
                </td>
                <td className="py-4 px-2 text-right text-rose-300">
                  Ksh {totals.housingLevy.toFixed(2)}
                </td>
                <td className="py-4 px-2 text-right text-emerald-300">
                  Ksh {totals.personalRelief.toFixed(2)}
                </td>
                <td className="py-4 px-2 text-right text-rose-400">
                  Ksh {totals.paye.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* DYNAMIC HIGH-CONTRAST KRA PRINT TARGET (HIDDEN OFF-SCREEN) */}
      <div className="absolute left-[-9999px] top-0">
        <div
          ref={printRef}
          className="w-[1000px] p-10 bg-white text-slate-900 font-sans space-y-6 border border-slate-300"
          style={{ color: "#111827" }}
        >
          {/* KRA Form Header */}
          <div className="text-center border-b-2 border-slate-900 pb-4">
            <h1 className="text-2xl font-black tracking-tight uppercase">
              KENYA REVENUE AUTHORITY
            </h1>
            <h2 className="text-lg font-bold uppercase tracking-wider">
              TAX DEDUCTION CARD (P9)
            </h2>
            <p className="text-md font-semibold mt-1">
              YEAR OF INCOME: {selectedYear}
            </p>
          </div>

          {/* Metadata Section */}
          <div className="grid grid-cols-2 gap-8 text-sm border border-slate-300 p-4 rounded-xl">
            <div className="space-y-2">
              <p>
                <strong>Employer's Name:</strong>{" "}
                {employeeProfile?.organization_name || "AGRIELDO"}
              </p>
              <p>
                <strong>Employer's KRA PIN:</strong>{" "}
                {employeeProfile?.organization_kra_pin || "PXXXXXXXXX"}
              </p>
              <p>
                <strong>Employee's Name:</strong>{" "}
                {[employeeProfile?.first_name, employeeProfile?.last_name]
                  .filter(Boolean)
                  .join(" ") || "Not provided"}
              </p>
            </div>
            <div className="space-y-2">
              <p>
                <strong>Employee's PIN:</strong>{" "}
                {employeeProfile?.payroll_profile?.kra_pin || "Not provided"}
              </p>
              <p>
                <strong>Employee ID:</strong>{" "}
                {employeeProfile?.payroll_profile?.employee_id || "N/A"}
              </p>
              <p>
                <strong>Primary Department:</strong>{" "}
                {employeeProfile?.payroll_profile?.department_name || "N/A"}
              </p>
            </div>
          </div>

          {/* Official P9 Columns Grid */}
          <table className="w-full text-[11px] border border-slate-400 text-left">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-400 text-[10px] font-bold">
                <th className="py-2 px-1 border-r border-slate-400">Month</th>
                <th className="py-2 px-1 text-right border-r border-slate-400">
                  Basic Pay
                </th>
                <th className="py-2 px-1 text-right border-r border-slate-400">
                  Benefits
                </th>
                <th className="py-2 px-1 text-right border-r border-slate-400">
                  Gross Pay
                </th>
                <th className="py-2 px-1 text-right border-r border-slate-400">
                  NSSF
                </th>
                <th className="py-2 px-1 text-right border-r border-slate-400">
                  SHA (2.75%)
                </th>
                <th className="py-2 px-1 text-right border-r border-slate-400">
                  Housing Levy
                </th>
                <th className="py-2 px-1 text-right border-r border-slate-400">
                  Personal Relief
                </th>
                <th className="py-2 px-1 text-right">P.A.Y.E Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {p9Records.map((m, index) => (
                <tr key={index}>
                  <td className="py-2 px-1 border-r border-slate-300 font-bold">
                    {m.monthName}
                  </td>
                  <td className="py-2 px-1 text-right border-r border-slate-300">
                    {m.basicSalary.toLocaleString()}
                  </td>
                  <td className="py-2 px-1 text-right border-r border-slate-300">
                    {m.allowance.toLocaleString()}
                  </td>
                  <td className="py-2 px-1 text-right border-r border-slate-300 font-bold">
                    {m.grossPay.toLocaleString()}
                  </td>
                  <td className="py-2 px-1 text-right border-r border-slate-300">
                    {m.nssf.toLocaleString()}
                  </td>
                  <td className="py-2 px-1 text-right border-r border-slate-300">
                    {m.sha.toLocaleString()}
                  </td>
                  <td className="py-2 px-1 text-right border-r border-slate-300">
                    {m.housingLevy.toLocaleString()}
                  </td>
                  <td className="py-2 px-1 text-right border-r border-slate-300">
                    {m.personalRelief.toLocaleString()}
                  </td>
                  <td className="py-2 px-1 text-right font-bold">
                    {m.paye.toLocaleString()}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-200 font-black text-[12px] border-t-2 border-slate-900">
                <td className="py-3 px-1 border-r border-slate-400">
                  ANNUAL TOTALS
                </td>
                <td className="py-3 px-1 text-right border-r border-slate-400">
                  {totals.basicSalary.toLocaleString()}
                </td>
                <td className="py-3 px-1 text-right border-r border-slate-400">
                  {totals.allowance.toLocaleString()}
                </td>
                <td className="py-3 px-1 text-right border-r border-slate-400">
                  {totals.grossPay.toLocaleString()}
                </td>
                <td className="py-3 px-1 text-right border-r border-slate-400">
                  {totals.nssf.toLocaleString()}
                </td>
                <td className="py-3 px-1 text-right border-r border-slate-400">
                  {totals.sha.toLocaleString()}
                </td>
                <td className="py-3 px-1 text-right border-r border-slate-400">
                  {totals.housingLevy.toLocaleString()}
                </td>
                <td className="py-3 px-1 text-right border-r border-slate-400">
                  {totals.personalRelief.toLocaleString()}
                </td>
                <td className="py-3 px-1 text-right">
                  {totals.paye.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Employer Certification Declaration */}
          <div className="border border-slate-400 p-4 space-y-4 rounded-xl text-xs">
            <p className="italic">
              I certify that the particulars given above are correct and that
              Income Tax has been deducted at source from the emoluments paid to
              the above-named employee in accordance with the provisions of the
              Income Tax Act (Cap. 470).
            </p>
            <div className="flex justify-between items-end pt-4">
              <div>
                <p className="border-t border-slate-400 pt-1 w-48 text-center">
                  Authorized Representative
                </p>
              </div>
              <div>
                <p className="border-t border-slate-400 pt-1 w-48 text-center">
                  Company Stamp & Date
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
