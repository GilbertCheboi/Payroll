import React from "react";
import DashboardHome from "../components/DashboardHome";
import EmployeeDashboard from "./EmployeeDashboard";
import Leaves from "./Leaves";

export default function Dashboard({ userRole, onNavigate }) {
  if (userRole === "EMPLOYEE") {
    return <EmployeeDashboard />;
  }

  return (
    <div className="space-y-6 p-8">
      <DashboardHome userRole={userRole} />
      <Leaves
        userRole={userRole}
        dashboardPreview
        onNavigate={onNavigate}
      />
    </div>
  );
}
