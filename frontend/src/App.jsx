import React, { useCallback, useEffect, useState } from "react";
import API from "./api";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Departments from "./pages/Departments";
import HRManagement from "./pages/HRManagement";
import Payroll from "./pages/Payroll";
import Profile from "./pages/Profile";
import Payslip from "./pages/Payslip";
import P9Certificate from "./pages/P9Certificate.jsx";
import Reports from "./pages/Reports.jsx";
import Billing from "./pages/Billing.jsx";
import Leaves from "./pages/Leaves.jsx";
import PasswordReset from "./pages/PasswordReset.jsx";

export default function App() {
  const resetHash = window.location.hash;
  const resetParams = new URLSearchParams(
    resetHash.startsWith("#reset?")
      ? resetHash.slice("#reset?".length)
      : "",
  );
  const resetUid = resetParams.get("uid") || "";
  const resetToken = resetParams.get("token") || "";
  const hasResetLink = Boolean(resetUid && resetToken);
  const [isAuth, setIsAuth] = useState(
    () => !hasResetLink && Boolean(localStorage.getItem("access_token")),
  );
  const [view, setView] = useState(() =>
    hasResetLink
      ? "reset-password"
      : localStorage.getItem("access_token")
        ? "dashboard"
        : "landing",
  );
  const [userRole, setUserRole] = useState(
    localStorage.getItem("user_role") || "EMPLOYEE",
  );
  const [organizations, setOrganizations] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("organizations") || "[]");
    } catch {
      return [];
    }
  });
  const [themeColor, setThemeColor] = useState(
    () => localStorage.getItem("organization_theme_color") || "#10b981",
  );
  const [billingLocked, setBillingLocked] = useState(false);
  const [billingChecked, setBillingChecked] = useState(false);
  const [passwordResetSession, setPasswordResetSession] = useState(false);

  useEffect(() => {
    if (hasResetLink) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    }
  }, [hasResetLink]);

  const refreshBillingLock = useCallback(async () => {
    if (passwordResetSession) {
      setBillingLocked(false);
      setBillingChecked(true);
      return;
    }
    if (!isAuth || userRole !== "ADMIN") {
      setBillingLocked(false);
      setBillingChecked(true);
      return;
    }

    try {
      const response = await API.get("billing/");
      const nextLocked = Boolean(response.data.billing_overdue);
      setBillingLocked(nextLocked);
      if (nextLocked && view !== "billing") {
        setView("billing");
      }
    } catch (error) {
      setBillingLocked(false);
      console.warn("Unable to check billing state.", error);
    } finally {
      setBillingChecked(true);
    }
  }, [isAuth, passwordResetSession, userRole, view]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", themeColor);
    document.documentElement.style.setProperty("--accent-hover", themeColor);
    document.documentElement.style.setProperty(
      "--accent-bg",
      `color-mix(in srgb, ${themeColor} 14%, transparent)`,
    );
    document.documentElement.style.setProperty(
      "--accent-border",
      `color-mix(in srgb, ${themeColor} 55%, transparent)`,
    );
  }, [themeColor]);

  useEffect(() => {
    if (isAuth) {
      refreshBillingLock();
    }
  }, [isAuth, refreshBillingLock]);

  useEffect(() => {
    setBillingChecked(false);
  }, [userRole]);

  const handleSuccess = (role, availableOrganizations = []) => {
    setIsAuth(true);
    setView("dashboard");
    setUserRole(role || "EMPLOYEE");
    setBillingChecked(false);
    setOrganizations(availableOrganizations);
    if (availableOrganizations[0]?.theme_color) {
      localStorage.setItem(
        "organization_theme_color",
        availableOrganizations[0].theme_color,
      );
      setThemeColor(availableOrganizations[0].theme_color);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("organization_name");
    localStorage.removeItem("organization_id");
    localStorage.removeItem("organizations");
    localStorage.removeItem("organization_theme_color");
    localStorage.removeItem("user_role");
    setIsAuth(false);
    setUserRole("EMPLOYEE");
    setPasswordResetSession(false);
    setView("login");
    setBillingChecked(false);
  };

  const handlePhoneResetVerified = async (accessToken) => {
    [
      "access_token",
      "refresh_token",
      "organization_name",
      "organization_id",
      "organizations",
      "organization_theme_color",
      "user_role",
    ].forEach((key) => localStorage.removeItem(key));
    localStorage.setItem("access_token", accessToken);
    try {
      const response = await API.get("accounts/me/");
      const profile = response.data;
      const availableOrganizations = profile.organizations || [];
      localStorage.setItem("organizations", JSON.stringify(availableOrganizations));
      if (profile.organization_name) {
        localStorage.setItem("organization_name", profile.organization_name);
      }
      if (availableOrganizations[0]?.id) {
        localStorage.setItem(
          "organization_id",
          String(availableOrganizations[0].id),
        );
        localStorage.setItem(
          "organization_name",
          availableOrganizations[0].name,
        );
        localStorage.setItem(
          "organization_theme_color",
          availableOrganizations[0].theme_color || "#10b981",
        );
        setThemeColor(availableOrganizations[0].theme_color || "#10b981");
      }
      if (profile.role) {
        localStorage.setItem("user_role", profile.role);
      }
      setOrganizations(availableOrganizations);
      setUserRole(profile.role || "EMPLOYEE");
      setPasswordResetSession(true);
      setBillingLocked(false);
      setBillingChecked(true);
      setIsAuth(true);
      setView("profile");
    } catch (error) {
      localStorage.removeItem("access_token");
      console.error("Unable to open profile after phone verification.", error);
      throw error;
    }
  };

  const clearPasswordResetLink = () => {
    window.history.replaceState({}, document.title, window.location.pathname);
    setView("login");
  };

  if (view === "forgot-password") {
    return (
      <PasswordReset
        mode="request"
        onBack={() => setView("login")}
        onPhoneVerified={handlePhoneResetVerified}
      />
    );
  }

  if (view === "reset-password") {
    return (
      <PasswordReset
        mode="confirm"
        uid={resetUid}
        token={resetToken}
        onBack={clearPasswordResetLink}
        onCompleted={clearPasswordResetLink}
      />
    );
  }

  if (passwordResetSession) {
    return (
      <Profile
        passwordResetMode
        onPasswordResetComplete={handleLogout}
      />
    );
  }

  if (!isAuth) {
    if (view === "login")
      return (
        <Login
          onSuccess={handleSuccess}
          onBack={() => setView("landing")}
          onForgotPassword={() => setView("forgot-password")}
        />
      );
    if (view === "signup")
      return (
        <Signup onSuccess={handleSuccess} onBack={() => setView("landing")} />
      );
    return (
      <Landing
        onLogin={() => setView("login")}
        onGetStarted={() => setView("signup")}
      />
    );
  }

  if (userRole === "ADMIN" && !billingChecked) {
    return <div className="min-h-screen bg-slate-950 p-8 text-slate-300">Checking billing status…</div>;
  }

  const renderView = () => {
    if (billingLocked && view !== "billing") {
      return <Billing />;
    }

    switch (view) {
      case "dashboard":
        return <Dashboard userRole={userRole} onNavigate={setView} />;
      case "profile":
        return (
          <Profile
            onOrganizationChanged={handleThemeChanged}
            passwordResetMode={passwordResetSession}
            onPasswordResetComplete={handleLogout}
          />
        );
      case "settings":
        return <Profile settingsMode onOrganizationChanged={handleThemeChanged} />;
      case "payslip":
        return <Payslip />;
      case "payroll":
        return <Payroll />;
      case "employees":
        return <Employees />;
      case "departments":
        return <Departments />;
      case "hr":
        return <HRManagement />;
      case "P9":
        return <P9Certificate />;
      case "reports":
        return <Reports />;
      case "billing":
        return userRole === "ADMIN" ? <Billing /> : <Dashboard userRole={userRole} />;
      case "leaves":
        return <Leaves userRole={userRole} />;
      default:
        return <Dashboard userRole={userRole} />;
    }
  };

  const organizationName =
    localStorage.getItem("organization_name") || "PayrollMatrix";
  const organizationId =
    localStorage.getItem("organization_id") || organizations[0]?.id;

  const handleOrganizationChange = (nextOrganizationId) => {
    const selected = organizations.find(
      (organization) => String(organization.id) === String(nextOrganizationId),
    );
    if (!selected) return;
    localStorage.setItem("organization_id", String(selected.id));
    localStorage.setItem("organization_name", selected.name);
    localStorage.setItem(
      "organization_theme_color",
      selected.theme_color || "#10b981",
    );
    setThemeColor(selected.theme_color || "#10b981");
    window.location.reload();
  };

  const handleThemeChanged = (updatedOrganization) => {
    const nextOrganizations = organizations.map((organization) =>
      String(organization.id) === String(updatedOrganization.id)
        ? { ...organization, ...updatedOrganization }
        : organization,
    );
    setOrganizations(nextOrganizations);
    localStorage.setItem("organizations", JSON.stringify(nextOrganizations));
    if (
      String(updatedOrganization.id) === localStorage.getItem("organization_id")
    ) {
      localStorage.setItem("organization_name", updatedOrganization.name);
      localStorage.setItem("organization_theme_color", updatedOrganization.theme_color);
      setThemeColor(updatedOrganization.theme_color);
    }
  };

  return (
    <Layout
      onNavigate={(k) => {
        if (billingLocked && k !== "billing") {
          setView("billing");
          return;
        }
        setView(k);
      }}
      active={view}
      onLogout={handleLogout}
      orgName={organizationName}
      userRole={userRole}
      organizations={organizations}
      organizationId={organizationId}
      onOrganizationChange={handleOrganizationChange}
      themeColor={themeColor}
      billingLocked={billingLocked}
    >
      {renderView()}
    </Layout>
  );
}
