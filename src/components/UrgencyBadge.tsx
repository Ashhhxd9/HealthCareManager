import React from "react";

interface UrgencyBadgeProps {
  urgency: "Low" | "Medium" | "High" | string | null;
}

export default function UrgencyBadge({ urgency }: UrgencyBadgeProps) {
  if (!urgency) return null;
  
  const val = urgency.charAt(0).toUpperCase() + urgency.slice(1).toLowerCase();
  
  let className = "badge-medium";
  if (val === "Low") className = "badge-low";
  if (val === "High") className = "badge-high";

  return <span className={`badge ${className}`}>{val}</span>;
}
