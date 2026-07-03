import React from "react";

interface DashboardCardProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export default function DashboardCard({ title, icon, children }: DashboardCardProps) {
  return (
    <div className="glass-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <h3 style={{ fontSize: "1.15rem", fontWeight: "700" }}>{title}</h3>
        {icon && <div style={{ color: "var(--accent-color)" }}>{icon}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}
