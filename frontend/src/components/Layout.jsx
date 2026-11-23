import React, { useState } from "react";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";

export default function Layout({
  children,
  onNavigate,
  active,
  onLogout,
  orgName,
  userRole,
  organizations,
  onOrganizationChange,
  organizationId,
  themeColor,
  billingLocked = false,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div
      className="app-container"
      style={{
        "--accent": themeColor,
        "--accent-hover": themeColor,
        "--accent-bg": `color-mix(in srgb, ${themeColor} 14%, transparent)`,
        "--accent-border": `color-mix(in srgb, ${themeColor} 55%, transparent)`,
      }}
    >
      <Sidebar
        onNavigate={onNavigate}
        active={active}
        onLogout={onLogout}
        orgName={orgName}
        userRole={userRole}
        organizations={organizations}
        onOrganizationChange={onOrganizationChange}
        organizationId={organizationId}
        billingLocked={billingLocked}
      />
      <div className="flex-1 min-h-screen flex flex-col">
        <Navbar onMenuClick={() => setMobileMenuOpen(true)} />
        {mobileMenuOpen && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/70 md:hidden"
            aria-label="Close navigation menu"
          />
        )}
        {mobileMenuOpen && (
          <Sidebar
            mobile
            onClose={() => setMobileMenuOpen(false)}
            onNavigate={onNavigate}
            active={active}
            onLogout={onLogout}
            orgName={orgName}
            userRole={userRole}
            organizations={organizations}
            onOrganizationChange={onOrganizationChange}
            organizationId={organizationId}
            billingLocked={billingLocked}
          />
        )}
        <main
          className="flex-1 overflow-auto bg-slate-950 p-6"
          style={{
            borderTop: "3px solid var(--accent)",
            backgroundImage:
              "linear-gradient(135deg, var(--accent-bg), transparent 35%)",
          }}
        >
          <div key={organizationId} className="min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
