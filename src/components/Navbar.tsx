"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Activity, User } from "lucide-react";

interface NavbarProps {
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  onLogoutSuccess?: () => void;
}

export default function Navbar({ currentUser, onLogoutSuccess }: NavbarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        if (onLogoutSuccess) {
          onLogoutSuccess();
        } else {
          router.push("/login");
          router.refresh();
        }
      }
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <header className="app-header">
      <div className="nav-wrapper">
        <Link href="/" className="logo">
          <Activity size={24} />
          <span>Clinic</span>Manager
        </Link>

        <nav className="nav-links">
          {currentUser ? (
            <>
              {currentUser.role === "ADMIN" && (
                <Link href="/admin" className="sidebar-link active">Admin Portal</Link>
              )}
              {currentUser.role === "PATIENT" && (
                <Link href="/patient" className="sidebar-link active">Patient Portal</Link>
              )}
              {currentUser.role === "DOCTOR" && (
                <Link href="/doctor" className="sidebar-link active">Doctor Portal</Link>
              )}
              
              <div className="user-badge" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <User size={14} />
                <span>
                  {currentUser.name} ({currentUser.role})
                </span>
              </div>

              <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
                <LogOut size={14} />
                Logout
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-primary">Sign In / Register</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
