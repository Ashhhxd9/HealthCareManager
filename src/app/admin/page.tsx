"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import DashboardCard from "@/components/DashboardCard";
import { Plus, User, Stethoscope, Clock, Calendar, Check, Trash, AlertTriangle, RefreshCw } from "lucide-react";

interface Doctor {
  id: string;
  name: string;
  email: string;
  doctorProfile: {
    specialisation: string;
    workingHoursStart: string;
    workingHoursEnd: string;
    slotDuration: number;
    leaveDays: string;
  } | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states for creating doctor
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newSpec, setNewSpec] = useState("General Medicine");
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [newDuration, setNewDuration] = useState("30");

  // State for editing doctor
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [editSpec, setEditSpec] = useState("");
  const [editStart, setEditStart] = useState("09:00");
  const [editEnd, setEditEnd] = useState("17:00");
  const [editDuration, setEditDuration] = useState("30");
  const [editLeaves, setEditLeaves] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Appointments registry states
  const [appointments, setAppointments] = useState<any[]>([]);
  const [filterDoc, setFilterDoc] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedAppt, setSelectedAppt] = useState<any>(null);

  // Leave Requests state
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);

  useEffect(() => {
    const initPage = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        
        if (!data.authenticated || data.user.role !== "ADMIN") {
          router.push("/login");
          return;
        }

        setCurrentUser(data.user);
        await fetchDoctors();
        await fetchAppointments();
        await fetchLeaveRequests();
      } catch (err) {
        console.error("Init failed", err);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };
    initPage();
  }, [router]);

  const fetchDoctors = async () => {
    try {
      const res = await fetch("/api/admin/doctors");
      if (res.ok) {
        const data = await res.json();
        setDoctors(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch doctors", err);
    }
  };

  const fetchLeaveRequests = async () => {
    try {
      const res = await fetch("/api/doctor/leave-request");
      if (res.ok) {
        const data = await res.json();
        setLeaveRequests(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch leave requests", err);
    }
  };

  const handleApproveLeave = async (requestId: string) => {
    if (!confirm("Are you sure you want to approve this leave request? Affected patient appointments will be cancelled and notified.")) return;
    setError("");
    setSuccess("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/leave-request/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Leave request approved successfully! Blocked slots and cancelled conflicting appointments.`);
        await fetchLeaveRequests();
        await fetchDoctors();
        await fetchAppointments();
      } else {
        throw new Error(data.error || "Approval failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to approve leave request");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectLeave = async (requestId: string) => {
    if (!confirm("Are you sure you want to decline this leave request?")) return;
    setError("");
    setSuccess("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/leave-request/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      if (res.ok) {
        setSuccess("Leave request declined.");
        await fetchLeaveRequests();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Rejection failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to reject request");
    } finally {
      setActionLoading(false);
    }
  };

  const fetchAppointments = async () => {
    try {
      const res = await fetch("/api/appointments/list");
      if (res.ok) {
        const data = await res.json();
        setAppointments(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch appointments", err);
    }
  };

  const handleCancelAppointment = async (apptId: string) => {
    if (!confirm("Are you sure you want to cancel this appointment?")) return;
    setError("");
    setSuccess("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/appointments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: apptId }),
      });
      if (res.ok) {
        setSuccess("Appointment cancelled successfully! Cancellation emails were dispatched to both doctor and patient.");
        await fetchAppointments();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Cancellation failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to cancel appointment");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setActionLoading(true);

    try {
      const res = await fetch("/api/admin/doctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword,
          specialisation: newSpec,
          workingHoursStart: newStart,
          workingHoursEnd: newEnd,
          slotDuration: newDuration,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create doctor");

      setSuccess(`Doctor profile created for Dr. ${newName}!`);
      
      // Reset inputs
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      
      await fetchDoctors();
    } catch (err: any) {
      setError(err.message || "Failed to create doctor");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectEdit = (doc: Doctor) => {
    setEditingDoctor(doc);
    if (doc.doctorProfile) {
      setEditSpec(doc.doctorProfile.specialisation);
      setEditStart(doc.doctorProfile.workingHoursStart);
      setEditEnd(doc.doctorProfile.workingHoursEnd);
      setEditDuration(doc.doctorProfile.slotDuration.toString());
      setEditLeaves(doc.doctorProfile.leaveDays || "");
    }
    setError("");
    setSuccess("");
  };

  const handleUpdateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoctor) return;

    setError("");
    setSuccess("");
    setActionLoading(true);

    try {
      const res = await fetch(`/api/admin/doctors/${editingDoctor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingDoctor.name,
          email: editingDoctor.email,
          specialisation: editSpec,
          workingHoursStart: editStart,
          workingHoursEnd: editEnd,
          slotDuration: editDuration,
          leaveDays: editLeaves,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile");

      if (data.cancelledAppointmentsCount > 0) {
        setSuccess(`Dr. ${editingDoctor.name}'s profile updated! ${data.cancelledAppointmentsCount} conflicting appointments were automatically cancelled, and affected patients were notified.`);
      } else {
        setSuccess(`Dr. ${editingDoctor.name}'s profile updated successfully.`);
      }

      setEditingDoctor(null);
      await fetchDoctors();
    } catch (err: any) {
      setError(err.message || "Failed to update doctor profile");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDoctor = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete Dr. ${name}? This will delete their profile and appointments.`)) return;

    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/admin/doctors/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSuccess(`Dr. ${name} has been deleted.`);
        await fetchDoctors();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete doctor");
    }
  };

  const filteredAppointments = appointments.filter((appt) => {
    const matchesDoc = filterDoc === "all" || appt.doctorId === filterDoc;
    
    const isCancelled = appt.status.startsWith("CANCELLED");
    const isCompleted = !!appt.postVisitNotes;
    const isUpcoming = appt.status === "BOOKED" && !isCompleted;

    if (filterStatus === "all") return matchesDoc;
    if (filterStatus === "upcoming") return matchesDoc && isUpcoming;
    if (filterStatus === "completed") return matchesDoc && isCompleted;
    if (filterStatus === "cancelled") return matchesDoc && isCancelled;
    return matchesDoc;
  });

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "#0b0f19" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading Admin Portal...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Navbar currentUser={currentUser} />

      <main className="main-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <div>
            <h1 style={{ fontSize: "1.85rem", fontWeight: "800" }}>Admin Dashboard</h1>
            <p>Configure doctor profiles, working hours, and manage leaves</p>
          </div>
          <button onClick={fetchDoctors} className="btn btn-secondary" style={{ padding: "0.5rem" }}>
            <RefreshCw size={16} />
          </button>
        </div>

        {error && (
          <div className="banner banner-error">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="banner banner-success">
            <Check size={18} />
            <span>{success}</span>
          </div>
        )}

        <div className="dashboard-grid">
          {/* Form Side */}
          <div className="dashboard-sidebar">
            {!editingDoctor ? (
              <DashboardCard title="Add Doctor Profile" icon={<Plus size={18} />}>
                <form onSubmit={handleCreateDoctor} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Dr. Alice Smith"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="alice@clinic.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Specialisation</label>
                    <select
                      value={newSpec}
                      onChange={(e) => setNewSpec(e.target.value)}
                      className="form-select"
                    >
                      <option value="General Medicine">General Medicine</option>
                      <option value="Cardiology">Cardiology</option>
                      <option value="Pediatrics">Pediatrics</option>
                      <option value="Dermatology">Dermatology</option>
                      <option value="Neurology">Neurology</option>
                    </select>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div className="form-group">
                      <label className="form-label">Shift Start</label>
                      <input
                        type="text"
                        placeholder="09:00"
                        required
                        value={newStart}
                        onChange={(e) => setNewStart(e.target.value)}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Shift End</label>
                      <input
                        type="text"
                        placeholder="17:00"
                        required
                        value={newEnd}
                        onChange={(e) => setNewEnd(e.target.value)}
                        className="form-input"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Slot Duration (Mins)</label>
                    <select
                      value={newDuration}
                      onChange={(e) => setNewDuration(e.target.value)}
                      className="form-select"
                    >
                      <option value="15">15 Minutes</option>
                      <option value="30">30 Minutes</option>
                      <option value="45">45 Minutes</option>
                      <option value="60">60 Minutes</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="btn btn-primary"
                    style={{ width: "100%", marginTop: "0.5rem" }}
                  >
                    Create Doctor Account
                  </button>
                </form>
              </DashboardCard>
            ) : (
              <DashboardCard title="Edit Doctor Profile" icon={<Clock size={18} />}>
                <form onSubmit={handleUpdateDoctor} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  <div style={{ marginBottom: "0.5rem", padding: "0.75rem", backgroundColor: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>Editing Doctor:</p>
                    <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>{editingDoctor.name}</strong>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>{editingDoctor.email}</p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Specialisation</label>
                    <select
                      value={editSpec}
                      onChange={(e) => setEditSpec(e.target.value)}
                      className="form-select"
                    >
                      <option value="General Medicine">General Medicine</option>
                      <option value="Cardiology">Cardiology</option>
                      <option value="Pediatrics">Pediatrics</option>
                      <option value="Dermatology">Dermatology</option>
                      <option value="Neurology">Neurology</option>
                    </select>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div className="form-group">
                      <label className="form-label">Shift Start</label>
                      <input
                        type="text"
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                        className="form-input"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Shift End</label>
                      <input
                        type="text"
                        value={editEnd}
                        onChange={(e) => setEditEnd(e.target.value)}
                        className="form-input"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Slot Duration (Mins)</label>
                    <select
                      value={editDuration}
                      onChange={(e) => setEditDuration(e.target.value)}
                      className="form-select"
                    >
                      <option value="15">15 Minutes</option>
                      <option value="30">30 Minutes</option>
                      <option value="45">45 Minutes</option>
                      <option value="60">60 Minutes</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Leave Dates</label>
                    <input
                      type="text"
                      placeholder="YYYY-MM-DD, YYYY-MM-DD"
                      value={editLeaves}
                      onChange={(e) => setEditLeaves(e.target.value)}
                      className="form-input"
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Comma-separated dates. Scheduling leave cancels any conflicting appointments automatically.
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                    >
                      Save Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDoctor(null)}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </DashboardCard>
            )}
          </div>

          {/* List Table Side */}
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <h3 style={{ marginBottom: "1rem", fontSize: "1.2rem", fontWeight: "700" }}>Registered Doctors</h3>
            {doctors.length === 0 ? (
              <p style={{ color: "var(--text-secondary)" }}>No doctors registered. Create one using the form.</p>
            ) : (
              <div className="table-container">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>Doctor Info</th>
                      <th>Specialisation</th>
                      <th>Schedule Details</th>
                      <th>Active Leaves</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctors.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "var(--bg-tertiary)", display: "flex", justifyContent: "center", alignItems: "center", border: "1px solid var(--border-color)" }}>
                              <User size={16} style={{ color: "var(--accent-color)" }} />
                            </div>
                            <div>
                              <strong style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>Dr. {doc.name}</strong>
                              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{doc.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                            <Stethoscope size={14} style={{ color: "var(--accent-color)" }} />
                            {doc.doctorProfile?.specialisation || "General Medicine"}
                          </span>
                        </td>
                        <td>
                          {doc.doctorProfile ? (
                            <div style={{ fontSize: "0.85rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--text-secondary)" }}>
                                <Clock size={13} />
                                {doc.doctorProfile.workingHoursStart} - {doc.doctorProfile.workingHoursEnd}
                              </div>
                              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", paddingLeft: "1rem" }}>
                                ({doc.doctorProfile.slotDuration} min slots)
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.85rem", color: "var(--danger)" }}>No Schedule Configured</span>
                          )}
                        </td>
                        <td>
                          {doc.doctorProfile?.leaveDays ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                              {doc.doctorProfile.leaveDays.split(",").map((l, i) => (
                                <span
                                  key={i}
                                  style={{
                                    fontSize: "0.75rem",
                                    padding: "0.15rem 0.4rem",
                                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                                    border: "1px solid rgba(245, 158, 11, 0.2)",
                                    borderRadius: "4px",
                                    color: "var(--warning)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.2rem",
                                  }}
                                >
                                  <Calendar size={10} />
                                  {l.trim()}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>None scheduled</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                            <button
                              onClick={() => handleSelectEdit(doc)}
                              className="btn btn-secondary"
                              style={{ padding: "0.4rem 0.6rem", fontSize: "0.8rem" }}
                            >
                              Edit Profile
                            </button>
                            <button
                              onClick={() => handleDeleteDoctor(doc.id, doc.name)}
                              className="btn btn-danger"
                              style={{ padding: "0.4rem 0.6rem", fontSize: "0.8rem" }}
                            >
                              <Trash size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>

        </div>

        {/* Section 1.5: Doctor Leave Requests Approval Management */}
        <div className="glass-card" style={{ marginTop: "2rem", padding: "1.75rem" }}>
          <div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--text-primary)" }}>🍂 Specialist Leave Requests Approval</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
              Review and approve or reject schedule block requests submitted by medical specialists
            </p>
          </div>

          {leaveRequests.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", textAlign: "center", padding: "1rem" }}>
              No leave requests found in the system.
            </p>
          ) : (
            <div className="table-container">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Specialist Name</th>
                    <th>Requested Leave Date</th>
                    <th>Reason / Notes</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveRequests.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <strong>Dr. {req.doctor.name}</strong>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{req.doctor.email}</div>
                      </td>
                      <td>
                        <span style={{ fontWeight: "600", fontSize: "0.9rem" }}>{req.leaveDate}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: req.reason ? "normal" : "italic" }}>
                          {req.reason || "No reason specified"}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${req.status === "APPROVED" ? "low" : req.status === "PENDING" ? "medium" : "high"}`}>
                          {req.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                          <button
                            disabled={req.status !== "PENDING" || actionLoading}
                            onClick={() => handleApproveLeave(req.id)}
                            className="btn btn-primary"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem", backgroundColor: "var(--success)", border: "1px solid var(--success)" }}
                          >
                            Approve
                          </button>
                          <button
                            disabled={req.status !== "PENDING" || actionLoading}
                            onClick={() => handleRejectLeave(req.id)}
                            className="btn btn-danger"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                          >
                            Decline
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 2: Appointments Log & Patient Registry */}
        <div className="glass-card" style={{ marginTop: "2rem", padding: "1.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--text-primary)" }}>📅 Clinic Appointments & Patient Registry</h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>View, filter, and manage scheduled doctor appointments and access patient medical records</p>
            </div>
            
            {/* Filters */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <div className="form-group" style={{ marginBottom: 0, flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>Doctor:</span>
                <select
                  value={filterDoc}
                  onChange={(e) => setFilterDoc(e.target.value)}
                  className="form-select"
                  style={{ width: "160px", padding: "0.35rem 0.75rem", fontSize: "0.85rem", height: "34px" }}
                >
                  <option value="all">All Doctors</option>
                  {doctors.map(d => (
                    <option key={d.id} value={d.id}>Dr. {d.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0, flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="form-select"
                  style={{ width: "140px", padding: "0.35rem 0.75rem", fontSize: "0.85rem", height: "34px" }}
                >
                  <option value="all">All Statuses</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          {filteredAppointments.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem" }}>No matching appointments found.</p>
          ) : (
            <div className="table-container">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Patient Details</th>
                    <th>Assigned Doctor</th>
                    <th>Date & Time</th>
                    <th>Urgency</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.map((appt) => {
                    const isCancelled = appt.status.startsWith("CANCELLED");
                    const isCompleted = !!appt.postVisitNotes;
                    const isUpcoming = appt.status === "BOOKED" && !isCompleted;
                    
                    return (
                      <tr key={appt.id}>
                        <td>
                          <div>
                            <strong style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>{appt.patient.name}</strong>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{appt.patient.email}</div>
                          </div>
                        </td>
                        <td>
                          <div>
                            <strong style={{ color: "var(--text-primary)", fontSize: "0.9rem" }}>Dr. {appt.doctor.name}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Cardiology</div>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: "0.85rem" }}>
                            {new Date(appt.appointmentTime).toLocaleString()}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${(appt.urgency || "Low").toLowerCase()}`}>
                            {appt.urgency || "Low"}
                          </span>
                        </td>
                        <td>
                          {isCancelled ? (
                            <span style={{ color: "var(--danger)", fontSize: "0.85rem", fontWeight: "600" }}>Cancelled</span>
                          ) : isCompleted ? (
                            <span style={{ color: "var(--accent-color)", fontSize: "0.85rem", fontWeight: "600" }}>Completed</span>
                          ) : (
                            <span style={{ color: "var(--success)", fontSize: "0.85rem", fontWeight: "600" }}>Upcoming</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                            <button
                              onClick={() => setSelectedAppt(appt)}
                              className="btn btn-secondary"
                              style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                            >
                              Case File
                            </button>
                            <button
                              disabled={!isUpcoming || actionLoading}
                              onClick={() => handleCancelAppointment(appt.id)}
                              className="btn btn-danger"
                              style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal: Patient Case File & Consultation summary */}
        {selectedAppt && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            padding: "1rem"
          }}>
            <div className="glass-card" style={{
              width: "100%",
              maxWidth: "600px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "2rem",
              position: "relative",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)"
            }}>
              <h3 style={{ fontSize: "1.35rem", fontWeight: "700", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                📄 Patient Case File
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                Appointment: #{selectedAppt.id}
              </p>

              {/* Info Header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", backgroundColor: "var(--bg-tertiary)", padding: "1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", marginBottom: "1.5rem" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>Patient Info</span>
                  <div style={{ fontWeight: "700", color: "var(--text-primary)", fontSize: "0.95rem", marginTop: "0.15rem" }}>{selectedAppt.patient.name}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{selectedAppt.patient.email}</div>
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>Assigned Specialist</span>
                  <div style={{ fontWeight: "700", color: "var(--text-primary)", fontSize: "0.95rem", marginTop: "0.15rem" }}>Dr. {selectedAppt.doctor.name}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Cardiology</div>
                </div>
              </div>

              {/* Symptoms */}
              <div style={{ marginBottom: "1.25rem" }}>
                <h4 style={{ fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "0.35rem" }}>Reported Symptoms</h4>
                <div style={{ padding: "0.75rem 1rem", backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  "{selectedAppt.symptoms}"
                </div>
              </div>

              {/* Pre-Visit AI Analysis */}
              <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
                <div>
                  <h4 style={{ fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "0.35rem" }}>AI Urgency</h4>
                  <span className={`badge badge-${(selectedAppt.urgency || "Low").toLowerCase()}`} style={{ display: "inline-flex" }}>
                    {selectedAppt.urgency || "Low"}
                  </span>
                </div>
                <div>
                  <h4 style={{ fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "0.35rem" }}>AI Chief Complaint</h4>
                  <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                    {selectedAppt.chiefComplaint || "Not analyzed"}
                  </div>
                </div>
              </div>

              {/* Consultation Notes */}
              <div style={{ marginBottom: "1.25rem" }}>
                <h4 style={{ fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "0.35rem" }}>Doctor Consultation Notes</h4>
                {selectedAppt.postVisitNotes ? (
                  <div style={{ padding: "0.75rem 1rem", backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                    {selectedAppt.postVisitNotes}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                    No notes logged yet. Consultation is pending.
                  </div>
                )}
              </div>

              {/* Prescriptions */}
              {selectedAppt.prescription && selectedAppt.prescription !== "[]" && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <h4 style={{ fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "0.5rem" }}>Prescribed Medications</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {JSON.parse(selectedAppt.prescription).map((p: any, i: number) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0.75rem", backgroundColor: "rgba(49, 151, 149, 0.05)", border: "1px solid rgba(49, 151, 149, 0.2)", borderRadius: "4px", fontSize: "0.85rem" }}>
                        <span style={{ fontWeight: "700", color: "var(--accent-color)" }}>{p.drugName}</span>
                        <span style={{ color: "var(--text-secondary)" }}>{p.dosage} — {p.frequency.replace("_", " ")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Care Plan summary */}
              {selectedAppt.postVisitSummary && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <h4 style={{ fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "0.35rem" }}>AI Care Plan Summary</h4>
                  <div style={{ padding: "0.75rem 1rem", backgroundColor: "rgba(14, 165, 233, 0.05)", border: "1px solid rgba(14, 165, 233, 0.2)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                    {selectedAppt.postVisitSummary}
                  </div>
                </div>
              )}

              {/* Close Button */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "2rem" }}>
                <button
                  onClick={() => setSelectedAppt(null)}
                  className="btn btn-primary"
                  style={{ minWidth: "100px" }}
                >
                  Close Case File
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
