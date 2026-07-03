"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { LogIn, UserPlus, AlertCircle, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Check if already authenticated and redirect
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.authenticated) {
          redirectUser(data.user.role);
        }
      } catch (err) {
        console.error("Auth check failed", err);
      }
    };
    checkAuth();
  }, []);

  const redirectUser = (role: string) => {
    if (role === "ADMIN") router.push("/admin");
    else if (role === "DOCTOR") router.push("/doctor");
    else if (role === "PATIENT") router.push("/patient");
    router.refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
    const payload = isRegister ? { name, email, password } : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      setSuccess(isRegister ? "Registration successful! Loading portal..." : "Login successful! Loading portal...");
      
      // Delay slightly for visual effect, then redirect
      setTimeout(() => {
        redirectUser(data.user.role);
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const triggerLogin = async (eEmail: string, ePassword: string) => {
    setError("");
    setSuccess("");
    setLoading(true);
    setEmail(eEmail);
    setPassword(ePassword);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: eEmail, password: ePassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      setSuccess("Login successful! Loading portal...");
      
      setTimeout(() => {
        redirectUser(data.user.role);
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <Navbar currentUser={null} />

      <main className="auth-page" style={{ flexDirection: "column", gap: "1.5rem", padding: "3rem 1.5rem" }}>
        <div className="glass-card auth-card">
          <div className="auth-header">
            <h2 style={{ fontSize: "1.85rem", marginBottom: "0.5rem" }}>
              {isRegister ? "Join Our Clinic" : "Welcome Back"}
            </h2>
            <p>
              {isRegister
                ? "Create a patient account to manage your appointments"
                : "Sign in to access your clinic dashboard"}
            </p>
          </div>

          {error && (
            <div className="banner banner-error" style={{ marginBottom: "1rem" }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="banner banner-success" style={{ marginBottom: "1rem" }}>
              <CheckCircle2 size={18} />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {isRegister && (
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-input"
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: "100%", marginTop: "1rem", height: "45px" }}
            >
              {loading ? (
                "Processing..."
              ) : isRegister ? (
                <>
                  <UserPlus size={18} />
                  Register Patient Account
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", margin: "1.25rem 0", gap: "0.5rem" }}>
            <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border-color)" }}></div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>or</span>
            <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border-color)" }}></div>
          </div>

          <button
            type="button"
            onClick={() => window.location.href = "/api/auth/google/link"}
            className="btn btn-secondary"
            style={{ width: "100%", height: "45px", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.75rem" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.9rem" }}>
            <span style={{ color: "var(--text-secondary)" }}>
              {isRegister ? "Already have an account?" : "New to our clinic?"}
            </span>{" "}
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError("");
                setSuccess("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent-color)",
                fontWeight: "600",
                cursor: "pointer",
                padding: 0,
                fontSize: "0.9rem",
              }}
            >
              {isRegister ? "Sign In Here" : "Register Patient Account"}
            </button>
          </div>
        </div>

        <div className="glass-card" style={{ width: "100%", maxWidth: "420px", padding: "1.5rem", animation: "fadeIn 0.5s ease" }}>
          <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)" }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--accent-color)" }}></span>
            🧪 Demo Testing Credentials
          </h3>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem", lineHeight: "1.4" }}>
            This system auto-seeds default testing accounts. Click a button below to autofill and log in instantly:
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <button
              type="button"
              disabled={loading}
              onClick={() => triggerLogin("admin@test.com", "password")}
              className="btn btn-secondary"
              style={{ justifyContent: "space-between", padding: "0.5rem 0.75rem", fontSize: "0.8rem", height: "38px" }}
            >
              <span style={{ fontWeight: "700" }}>Admin Portal</span>
              <span style={{ color: "var(--text-muted)" }}>admin@test.com</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => triggerLogin("alice@test.com", "password")}
              className="btn btn-secondary"
              style={{ justifyContent: "space-between", padding: "0.5rem 0.75rem", fontSize: "0.8rem", height: "38px" }}
            >
              <span style={{ fontWeight: "700" }}>Doctor Portal</span>
              <span style={{ color: "var(--text-muted)" }}>alice@test.com</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => triggerLogin("bob@test.com", "password")}
              className="btn btn-secondary"
              style={{ justifyContent: "space-between", padding: "0.5rem 0.75rem", fontSize: "0.8rem", height: "38px" }}
            >
              <span style={{ fontWeight: "700" }}>Patient Portal</span>
              <span style={{ color: "var(--text-muted)" }}>bob@test.com</span>
            </button>
          </div>
          <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center" }}>
            Password for all accounts is <strong>password</strong>
          </div>
        </div>
      </main>
    </div>
  );
}
