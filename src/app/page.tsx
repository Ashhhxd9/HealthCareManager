"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";

export default function IndexPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        
        if (data.authenticated && data.user) {
          const role = data.user.role;
          if (role === "ADMIN") router.push("/admin");
          else if (role === "DOCTOR") router.push("/doctor");
          else if (role === "PATIENT") router.push("/patient");
        } else {
          router.push("/login");
        }
      } catch (err) {
        console.error("Session check failed, redirecting to login", err);
        router.push("/login");
      }
    };
    checkSession();
  }, [router]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      backgroundColor: "#0b0f19",
      color: "#ffffff",
      fontFamily: "var(--font-sans), sans-serif"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", animation: "pulse 2s infinite" }}>
        <Activity size={32} style={{ color: "#0ea5e9" }} />
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800 }}>ClinicManager</h1>
      </div>
      <p style={{ marginTop: "1rem", color: "#9ca3af", fontSize: "0.95rem" }}>Redirecting to portal dashboard...</p>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.98); }
        }
      `}</style>
    </div>
  );
}
