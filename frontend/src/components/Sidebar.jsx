import React from "react";

export default function Sidebar({
  onNavigate,
  active,
  onLogout,
  orgName,
  userRole,
  organizations,
  onOrganizationChange,
  organizationId,
  mobile = false,
  onClose,
  billingLocked = false,
}) {
  // 1. We determine the role. If userRole hasn't loaded yet, we can default to employee
  // or return null/loading spinner.
  const isEmployee = userRole === "EMPLOYEE";

  // 2. Fallback to an empty array if both fail (though they shouldn't, defensive is better!)
  const items = billingLocked
    ? [{ key: "billing", label: "Billing" }]
    : isEmployee
      ? [
          { key: "dashboard", label: "Dashboard" },
          { key: "leaves", label: "Leave requests" },
          { key: "profile", label: "My Profile" },
          { key: "payslip", label: "My Payslip" },
          { key: "P9", label: "P9 certificate" },
          { key: "settings", label: "Settings" },
        ]
      : [
          { key: "dashboard", label: "Dashboard" },
          { key: "profile", label: "My Profile" },
          { key: "employees", label: "Employees" },
          { key: "departments", label: "Departments" },
          { key: "leaves", label: "Leave requests" },
          { key: "hr", label: "HR Management" },
          { key: "payroll", label: "Payroll" },
          { key: "reports", label: "Reports" },
          ...(userRole === "ADMIN" ? [{ key: "billing", label: "Billing" }] : []),
          { key: "settings", label: "Settings" },
        ];

  return (
    <aside
      className={mobile
        ? "fixed left-0 top-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col overflow-hidden border-r bg-slate-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:hidden"
        : "sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden border-r bg-slate-900 p-4 md:flex"}
      style={{
        borderColor: "var(--accent-border)",
        boxShadow: "inset -4px 0 0 var(--accent-bg)",
      }}
    >
      <div className="mb-6 shrink-0">
        {mobile && (
          <button
            type="button"
            onClick={onClose}
            className="mb-4 rounded p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Close navigation menu"
          >
            X
          </button>
        )}
        <div
          className="h-10 w-10 rounded flex items-center justify-center font-bold text-slate-900"
          style={{ backgroundColor: "var(--accent)" }}
        >
          P
        </div>
        <div className="mt-4">
          <p className="text-xs text-slate-500 uppercase tracking-[0.24em] mb-1">
            Organization
          </p>
          {organizations?.length > 1 &&
          (userRole === "ADMIN" || userRole === "HR") ? (
            <select
              value={organizationId || ""}
              onChange={(event) => onOrganizationChange?.(event.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-2 text-sm font-semibold text-white outline-none"
              style={{ borderColor: "var(--accent)" }}
              aria-label="Select organization"
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          ) : (
            <h2 className="text-lg font-bold text-white leading-tight">
              {orgName || "PayrollMatrix"}
            </h2>
          )}
        </div>
      </div>
      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
        {/* 3. Safe Map: Added "?." and "|| []" to guarantee it never crashes even if items is null */}
        {(items || []).map((item) => (
          <button
            type="button"
            key={item.key}
            onClick={() => {
              onNavigate(item.key);
              onClose?.();
            }}
            className={`w-full text-left py-2 px-3 rounded ${active === item.key ? "text-white font-semibold" : "text-slate-300 hover:bg-slate-800"}`}
            style={active === item.key ? { backgroundColor: "var(--accent)" } : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto shrink-0 border-t border-slate-800 pt-4">
        <button
          type="button"
          onClick={() => {
            onLogout();
            onClose?.();
          }}
          className="w-full text-left text-slate-300 hover:text-white hover:bg-slate-800 rounded px-3 py-2 transition"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
