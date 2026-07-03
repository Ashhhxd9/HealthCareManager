"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import DashboardCard from "@/components/DashboardCard";
import PrescriptionForm from "@/components/PrescriptionForm";
import UrgencyBadge from "@/components/UrgencyBadge";
import { Calendar, User, Clock, FileText, CheckCircle, AlertTriangle, AlertCircle, CalendarRange } from "lucide-react";

interface Appointment {
  id: string;
  appointmentTime: string;
  status: string;
  symptoms: string;
  urgency: string | null;
  chiefComplaint: string | null;
  suggestedQuestions: string | null; // JSON String
  postVisitNotes: string | null;
  prescription: string | null; // JSON String
  postVisitSummary: string | null;
  patient: {
    name: string;
    email: string;
  };
}

interface Prescription {
  drugName: string;
  dosage: string;
  frequency: "morning" | "night" | "twice_daily" | "thrice_daily";
}

function DoctorDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Visit logging states
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [notes, setNotes] = useState("");
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Review states (pre-visit AI summary preview)
  const [reviewAppointment, setReviewAppointment] = useState<Appointment | null>(null);

  // Leave requests state
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [newLeaveDate, setNewLeaveDate] = useState("");
  const [newLeaveReason, setNewLeaveReason] = useState("");
  const [leaveLoading, setLeaveLoading] = useState(false);

  // Profile configuration states
  const [specialisation, setSpecialisation] = useState("General Medicine");
  const [workingHoursStart, setWorkingHoursStart] = useState("09:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState("30");
  const [profileUpdateLoading, setProfileUpdateLoading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const initPage = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();

        if (!data.authenticated || data.user.role !== "DOCTOR") {
          router.push("/login");
          return;
        }

        setCurrentUser(data.user);
        const profile = data.user.doctorProfile;
        if (profile) {
          setSpecialisation(profile.specialisation);
          setWorkingHoursStart(profile.workingHoursStart);
          setWorkingHoursEnd(profile.workingHoursEnd);
          setSlotDuration(profile.slotDuration.toString());
        }
        await fetchAppointments();
        await fetchLeaveRequests();

        // Check if calendar sync was redirect success
        if (searchParams.get("calendar_sync") === "success") {
          setSuccess("Successfully connected and synced with Google Calendar!");
        }
      } catch (err) {
        console.error("Init failed", err);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };
    initPage();
  }, [router, searchParams]);

  const fetchAppointments = async () => {
    try {
      const res = await fetch("/api/appointments/list");
      if (res.ok) {
        const data = await res.json();
        setAppointments(data || []);
      }
    } catch (err) {
      console.error(err);
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
      console.error(err);
    }
  };

  const handleApproveAppointment = async (apptId: string) => {
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/doctor/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: apptId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("Appointment approved successfully! Confirmation email and calendar invite sent to patient.");
        await fetchAppointments();
      } else {
        throw new Error(data.error || "Approval failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to approve appointment");
    }
  };

  const handleRejectAppointment = async (apptId: string) => {
    if (!confirm("Are you sure you want to decline this request?")) return;
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/doctor/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: apptId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("Appointment request declined. Patient notified via email.");
        await fetchAppointments();
      } else {
        throw new Error(data.error || "Rejection failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to reject appointment");
    }
  };

  const handleSubmitLeaveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeaveDate) return;
    setLeaveLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/doctor/leave-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveDate: newLeaveDate, reason: newLeaveReason }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("Leave request submitted! It has been sent to the administrator for review.");
        setNewLeaveDate("");
        setNewLeaveReason("");
        await fetchLeaveRequests();
      } else {
        throw new Error(data.error || "Submission failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to submit leave request");
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileUpdateLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/doctor/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specialisation,
          workingHoursStart,
          workingHoursEnd,
          slotDuration: parseInt(slotDuration),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("Profile settings updated successfully!");
        // Refresh session profile info
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const meData = await meRes.json();
          setCurrentUser(meData.user);
        }
      } else {
        throw new Error(data.error || "Failed to update profile settings");
      }
    } catch (err: any) {
      setError(err.message || "Failed to update settings");
    } finally {
      setProfileUpdateLoading(false);
    }
  };

  const handleOpenLogVisit = (appt: Appointment) => {
    setActiveAppointment(appt);
    setNotes(appt.postVisitNotes || "");
    setPrescriptions(
      appt.prescription ? JSON.parse(appt.prescription) : []
    );
    setError("");
    setSuccess("");
  };

  const handleSubmitVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAppointment || !notes) return;

    setSubmitLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/doctor/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: activeAppointment.id,
          postVisitNotes: notes,
          prescriptions,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit notes");

      setSuccess(`Care plan and prescription updated for patient ${activeAppointment.patient.name}.`);
      setActiveAppointment(null);
      await fetchAppointments();
    } catch (err: any) {
      setError(err.message || "Failed to submit care plan");
    } finally {
      setSubmitLoading(false);
    }
  };

  const pendingAppts = appointments.filter(a => a.status === "PENDING" && !a.postVisitNotes);
  const activeAppts = appointments.filter(a => a.status === "BOOKED" && !a.postVisitNotes);
  const completedAppts = appointments.filter(a => a.postVisitNotes !== null);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "#0b0f19" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading Doctor Portal...</p>
      </div>
    );
  }

  const isGoogleCalendarConnected = !!currentUser?.doctorProfile?.googleRefreshToken;

  return (
    <div className="app-container">
      <Navbar currentUser={currentUser} />

      <main className="main-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ fontSize: "1.85rem", fontWeight: "800" }}>Doctor Schedule Dashboard</h1>
            <p>Review patient symptoms, pre-visit notes, and configure prescriptions</p>
          </div>
          <div>
            {isGoogleCalendarConnected ? (
              <span className="badge badge-low" style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle size={16} />
                Google Calendar Synced
              </span>
            ) : (
              <a
                href="/api/oauth/link"
                className="btn btn-primary"
                style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
              >
                <CalendarRange size={16} />
                Connect Google Calendar
              </a>
            )}
          </div>
        </div>

        {error && (
          <div className="banner banner-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="banner banner-success">
            <CheckCircle size={18} />
            <span>{success}</span>
          </div>
        )}

        <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem" }}>
          {/* Left Column: Settings and Leave requests */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Shift hours & Specialty Settings */}
            <DashboardCard title="Availability & Shift Settings" icon={<Clock size={18} />}>
              <form onSubmit={handleUpdateProfile} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                <div className="form-group">
                  <label className="form-label">Specialisation / Specialty Area</label>
                  <select
                    value={specialisation}
                    onChange={(e) => setSpecialisation(e.target.value)}
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
                      required
                      placeholder="09:00"
                      value={workingHoursStart}
                      onChange={(e) => setWorkingHoursStart(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Shift End</label>
                    <input
                      type="text"
                      required
                      placeholder="17:00"
                      value={workingHoursEnd}
                      onChange={(e) => setWorkingHoursEnd(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Slot Duration (Mins)</label>
                  <select
                    value={slotDuration}
                    onChange={(e) => setSlotDuration(e.target.value)}
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
                  disabled={profileUpdateLoading}
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: "0.25rem" }}
                >
                  {profileUpdateLoading ? "Saving Settings..." : "Save Settings"}
                </button>
              </form>
            </DashboardCard>

            {/* Leave Requests submission and status table */}
            <DashboardCard title="Leave Requests Management" icon={<CalendarRange size={18} />}>
              <form onSubmit={handleSubmitLeaveRequest} style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1.25rem" }}>
                <div className="form-group">
                  <label className="form-label">Leave Date *</label>
                  <input
                    type="date"
                    required
                    value={newLeaveDate}
                    onChange={(e) => setNewLeaveDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Reason (Optional)</label>
                  <input
                    type="text"
                    placeholder="Medical conference, vacation, etc."
                    value={newLeaveReason}
                    onChange={(e) => setNewLeaveReason(e.target.value)}
                    className="form-input"
                  />
                </div>
                <button
                  type="submit"
                  disabled={leaveLoading || !newLeaveDate}
                  className="btn btn-secondary"
                  style={{ width: "100%" }}
                >
                  {leaveLoading ? "Submitting Request..." : "Request Leave"}
                </button>
              </form>

              <hr style={{ border: 0, borderTop: "1px solid var(--border-color)", margin: "1rem 0" }} />

              <h4 style={{ fontSize: "0.85rem", fontWeight: "700", marginBottom: "0.5rem" }}>Request Log</h4>
              {leaveRequests.length === 0 ? (
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>No leave requests submitted.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "150px", overflowY: "auto" }}>
                  {leaveRequests.map((req) => (
                    <div key={req.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem", backgroundColor: "rgba(255,255,255,0.01)", border: "1px solid var(--border-color)", borderRadius: "4px" }}>
                      <div>
                        <div style={{ fontSize: "0.8rem", fontWeight: "700" }}>{req.leaveDate}</div>
                        {req.reason && <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{req.reason}</div>}
                      </div>
                      <span className={`badge badge-${req.status === "APPROVED" ? "low" : req.status === "PENDING" ? "medium" : "high"}`} style={{ fontSize: "0.7rem" }}>
                        {req.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          </div>

          {/* Right Column: Appointments Lists */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Group 1: Pending Approvals */}
            <div className="glass-card">
              <h3 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "1rem" }}>Pending Booking Requests</h3>
              {pendingAppts.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>No requests pending your review.</p>
              ) : (
                <div className="table-container">
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Requested Time</th>
                        <th>Symptoms Preview</th>
                        <th>Urgency</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingAppts.map((appt) => (
                        <tr key={appt.id}>
                          <td>
                            <strong>{appt.patient.name}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{appt.patient.email}</div>
                          </td>
                          <td>
                            <span style={{ fontSize: "0.85rem" }}>
                              {new Date(appt.appointmentTime).toLocaleString()}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                              {appt.chiefComplaint || appt.symptoms.slice(0, 40) + "..."}
                            </div>
                          </td>
                          <td>
                            <UrgencyBadge urgency={appt.urgency} />
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
                              <button
                                onClick={() => setReviewAppointment(appt)}
                                className="btn btn-secondary"
                                style={{ padding: "0.35rem 0.6rem", fontSize: "0.75rem" }}
                              >
                                Preview
                              </button>
                              <button
                                onClick={() => handleApproveAppointment(appt.id)}
                                className="btn btn-primary"
                                style={{ padding: "0.35rem 0.6rem", fontSize: "0.75rem", backgroundColor: "var(--success)", border: "1px solid var(--success)" }}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectAppointment(appt.id)}
                                className="btn btn-danger"
                                style={{ padding: "0.35rem 0.6rem", fontSize: "0.75rem" }}
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

            {/* Group 2: Confirmed Appointments */}
            <div className="glass-card">
              <h3 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "1rem" }}>Upcoming Confirmed Schedule</h3>
              {activeAppts.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>No confirmed upcoming appointments.</p>
              ) : (
                <div className="table-container">
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Scheduled Time</th>
                        <th>Symptoms</th>
                        <th>Urgency</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeAppts.map((appt) => (
                        <tr key={appt.id}>
                          <td>
                            <strong>{appt.patient.name}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{appt.patient.email}</div>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.9rem" }}>
                              <Clock size={13} style={{ color: "var(--accent-color)" }} />
                              {new Date(appt.appointmentTime).toLocaleString()}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                              {appt.chiefComplaint || appt.symptoms.slice(0, 40) + "..."}
                            </div>
                          </td>
                          <td>
                            <UrgencyBadge urgency={appt.urgency} />
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                              <button
                                onClick={() => setReviewAppointment(appt)}
                                className="btn btn-secondary"
                                style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                              >
                                Review Symptoms
                              </button>
                              <button
                                onClick={() => handleOpenLogVisit(appt)}
                                className="btn btn-primary"
                                style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                              >
                                Log Visit
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

            {/* Group 3: History */}
            <div className="glass-card">
              <h3 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "1rem" }}>Completed Visit History</h3>
              {completedAppts.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>No completed visits on record.</p>
              ) : (
                <div className="table-container">
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Visit Date</th>
                        <th>Prescribed Meds</th>
                        <th>Care Plan Summary</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedAppts.map((appt) => (
                        <tr key={appt.id}>
                          <td>
                            <strong>{appt.patient.name}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{appt.patient.email}</div>
                          </td>
                          <td>{new Date(appt.appointmentTime).toLocaleDateString()}</td>
                          <td>
                            <span style={{ fontSize: "0.85rem" }}>
                              {appt.prescription ? JSON.parse(appt.prescription).map((p: any) => p.drugName).join(", ") : "None"}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {appt.postVisitSummary}
                            </div>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              onClick={() => handleOpenLogVisit(appt)}
                              className="btn btn-secondary"
                              style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                            >
                              Update Log
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Review Symptoms Pre-visit AI modal */}
      {reviewAppointment && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "600px" }}>
            <button onClick={() => setReviewAppointment(null)} className="modal-close">
              &times;
            </button>
            <h3 style={{ marginBottom: "0.5rem" }}>Patient Pre-Visit Symptoms Review</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
              Patient: <strong>{reviewAppointment.patient.name}</strong> | Visit: {new Date(reviewAppointment.appointmentTime).toLocaleString()}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div style={{ backgroundColor: "var(--bg-tertiary)", padding: "1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                <strong style={{ fontSize: "0.85rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Patient Description:</strong>
                <p style={{ marginTop: "0.5rem", fontSize: "0.95rem", color: "var(--text-primary)" }}>
                  "{reviewAppointment.symptoms}"
                </p>
              </div>

              <div style={{ backgroundColor: "rgba(14, 165, 233, 0.03)", padding: "1.25rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <strong style={{ fontSize: "0.95rem", color: "var(--accent-color)" }}>AI Clinical Assist Summary:</strong>
                  <UrgencyBadge urgency={reviewAppointment.urgency} />
                </div>
                
                <p style={{ fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "0.75rem" }}>
                  <strong>Chief Complaint:</strong> {reviewAppointment.chiefComplaint || "Symptom compilation"}
                </p>

                <p style={{ fontSize: "0.9rem", color: "var(--text-primary)", fontWeight: "600", marginBottom: "0.4rem" }}>
                  Suggested Inquiry Questions:
                </p>
                <ul style={{ paddingLeft: "1.25rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  {reviewAppointment.suggestedQuestions ? (
                    JSON.parse(reviewAppointment.suggestedQuestions).map((q: string, i: number) => (
                      <li key={i} style={{ marginBottom: "0.25rem" }}>{q}</li>
                    ))
                  ) : (
                    <>
                      <li>When exactly did the symptoms begin?</li>
                      <li>How would you rate the severity on a scale from 1-10?</li>
                      <li>Do you have any family history of related issues?</li>
                    </>
                  )}
                </ul>
              </div>
            </div>

            <div style={{ marginTop: "1.5rem", textAlign: "right" }}>
              <button onClick={() => setReviewAppointment(null)} className="btn btn-secondary">
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Visit Modal */}
      {activeAppointment && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "700px" }}>
            <button onClick={() => setActiveAppointment(null)} className="modal-close">
              &times;
            </button>
            <h3 style={{ marginBottom: "0.5rem" }}>Log Post-Visit Notes & Prescription</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
              Patient Name: <strong>{activeAppointment.patient.name}</strong> | Reported Symptoms: "{activeAppointment.symptoms}"
            </p>

            <form onSubmit={handleSubmitVisit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div className="form-group">
                <label className="form-label">Clinical Consultation Notes *</label>
                <textarea
                  required
                  placeholder="Record your findings, clinical observations, recommendations, and follow-up guidance..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="form-textarea"
                  style={{ minHeight: "150px" }}
                />
              </div>

              {/* Prescription Manager Component */}
              <PrescriptionForm
                prescriptions={prescriptions}
                onChange={(p) => setPrescriptions(p)}
              />

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={submitLoading || !notes}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {submitLoading ? "Analyzing & Generating Care Plan..." : "Submit Consultation & Issue Reminders"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAppointment(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DoctorPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "#0b0f19", color: "var(--text-secondary)" }}>
        <p>Loading Doctor Dashboard...</p>
      </div>
    }>
      <DoctorDashboardContent />
    </Suspense>
  );
}
