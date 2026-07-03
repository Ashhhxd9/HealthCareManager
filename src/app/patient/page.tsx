"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import DashboardCard from "@/components/DashboardCard";
import SlotPicker from "@/components/SlotPicker";
import UrgencyBadge from "@/components/UrgencyBadge";
import { Search, Calendar, ShieldAlert, Check, X, FileText, Pill, Plus, AlertCircle, Clock } from "lucide-react";

interface Doctor {
  id: string;
  name: string;
  email: string;
  doctorProfile: {
    specialisation: string;
    workingHoursStart: string;
    workingHoursEnd: string;
    slotDuration: number;
  } | null;
}

interface Appointment {
  id: string;
  appointmentTime: string;
  status: string;
  symptoms: string;
  urgency: string | null;
  chiefComplaint: string | null;
  suggestedQuestions: string | null;
  postVisitNotes: string | null;
  prescription: string | null;
  postVisitSummary: string | null;
  doctor: {
    name: string;
    email: string;
    doctorProfile: { specialisation: string } | null;
  };
}

interface MedicationReminder {
  id: string;
  drugName: string;
  dosage: string;
  frequency: string;
  timeOfDay: string;
  active: boolean;
}

export default function PatientPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reminders, setReminders] = useState<MedicationReminder[]>([]);
  
  const [selectedSpecialisation, setSelectedSpecialisation] = useState("All");
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);

  // Booking process states
  const [heldSlotTime, setHeldSlotTime] = useState<string | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [email, setEmail] = useState("");
  const [countdown, setCountdown] = useState(300); // 5 minutes in seconds
  const [bookingLoading, setBookingLoading] = useState(false);

  // View modal states
  const [selectedCarePlan, setSelectedCarePlan] = useState<Appointment | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const initPage = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();

        if (!data.authenticated || data.user.role !== "PATIENT") {
          router.push("/login");
          return;
        }

        setCurrentUser(data.user);
        await Promise.all([fetchDoctors(), fetchAppointments(), fetchReminders()]);
      } catch (err) {
        console.error("Init failed", err);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };
    initPage();
  }, [router]);

  // Countdown timer for Slot Hold TTL
  useEffect(() => {
    if (!heldSlotTime) return;
    
    setCountdown(300);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setHeldSlotTime(null);
          setError("Your slot hold has expired. Please select a slot again.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [heldSlotTime]);

  const fetchDoctors = async () => {
    try {
      const res = await fetch("/api/admin/doctors");
      if (res.ok) {
        const data = await res.json();
        setDoctors(data || []);
      }
    } catch (err) {
      console.error(err);
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
      console.error(err);
    }
  };

  const fetchReminders = async () => {
    try {
      // Find medication reminders by fetching active ones from db
      // Let's call our api to get reminders or simulate from db.
      // Wait, we need an endpoint to list patient's reminders, let's write `/api/appointments/reminders` endpoint!
      const res = await fetch("/api/appointments/reminders");
      if (res.ok) {
        const data = await res.json();
        setReminders(data || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSlotHeld = (slotTime: string) => {
    setHeldSlotTime(slotTime);
    setSymptoms("");
    setEmail(currentUser?.email || "");
    setError("");
    setSuccess("");
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctor || !heldSlotTime || !symptoms || !email) return;

    setBookingLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/appointments/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: selectedDoctor.id,
          slotTime: heldSlotTime,
          symptoms,
          email,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Booking failed");

      setSuccess(`Success! Appointment request submitted to Dr. ${selectedDoctor.name}. A pending review email was sent to ${email}.`);
      setHeldSlotTime(null);
      setSelectedDoctor(null);
      
      await Promise.all([fetchAppointments(), fetchReminders()]);
    } catch (err: any) {
      setError(err.message || "Failed to confirm booking");
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCancelAppointment = async (id: string, docName: string) => {
    if (!confirm(`Are you sure you want to cancel your appointment with Dr. ${docName}?`)) return;

    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/appointments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancellation failed");

      setSuccess(`Your appointment with Dr. ${docName} has been cancelled.`);
      await fetchAppointments();
    } catch (err: any) {
      setError(err.message || "Failed to cancel appointment");
    }
  };

  const handleToggleReminder = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/appointments/reminders/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentStatus }),
      });

      if (res.ok) {
        setReminders(prev =>
          prev.map(rem => (rem.id === id ? { ...rem, active: !currentStatus } : rem))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Comprehensive disease and specialisation options list
  const specialisationOptions = [
    { value: "All", label: "All Specialist Areas / Disease Types" },
    { value: "General Medicine", label: "General Medicine (Flu, Fever, Cough, Checkups)" },
    { value: "Cardiology", label: "Cardiology (Heart Disease, Blood Pressure, Chest Pain)" },
    { value: "Pediatrics", label: "Pediatrics (Infant & Child Health, Pediatric Care)" },
    { value: "Dermatology", label: "Dermatology (Skin Concerns, Rashes, Acne, Eczema)" },
    { value: "Neurology", label: "Neurology (Nerve Disorders, Migraines, Brain Health)" },
    { value: "Orthopedics", label: "Orthopedics (Joint Pain, Bone Fractures, Back Injury)" },
    { value: "Ophthalmology", label: "Ophthalmology (Vision Problems, Cataracts, Eye Pain)" },
    { value: "Gynecology", label: "Gynecology (Maternal Health, Female Reproductive System)" },
    { value: "Psychiatry", label: "Psychiatry (Mental Wellness, Stress, Anxiety, Therapy)" },
  ];

  const filteredDoctors = selectedSpecialisation === "All"
    ? doctors
    : doctors.filter(d => d.doctorProfile?.specialisation === selectedSpecialisation);

  const upcomingAppts = appointments.filter(a => (a.status === "BOOKED" || a.status === "PENDING") && new Date(a.appointmentTime) > new Date());
  const pastAppts = appointments.filter(a => !((a.status === "BOOKED" || a.status === "PENDING") && new Date(a.appointmentTime) > new Date()));

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "#0b0f19" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading Patient Portal...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Navbar currentUser={currentUser} />

      <main className="main-content">
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.85rem", fontWeight: "800" }}>Patient Dashboard</h1>
          <p>Book medical visits, view AI summaries, and monitor prescription schedules</p>
        </div>

        {error && (
          <div className="banner banner-error">
            <AlertCircle size={18} />
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
          {/* Sidebar - Finder & Booking */}
          <div className="dashboard-sidebar">
            <DashboardCard title="Find a Specialist" icon={<Search size={18} />}>
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="form-label">Specialisation</label>
                <select
                  value={selectedSpecialisation}
                  onChange={(e) => setSelectedSpecialisation(e.target.value)}
                  className="form-select"
                >
                  {specialisationOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "250px", overflowY: "auto", paddingRight: "0.25rem" }}>
                {filteredDoctors.length === 0 ? (
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No doctors match this specialisation.</p>
                ) : (
                  filteredDoctors.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => {
                        setSelectedDoctor(doc);
                        setHeldSlotTime(null);
                        setError("");
                        setSuccess("");
                      }}
                      className={`btn btn-secondary`}
                      style={{
                        justifyContent: "flex-start",
                        textAlign: "left",
                        padding: "0.75rem",
                        border: selectedDoctor?.id === doc.id ? "1px solid var(--accent-color)" : "1px solid var(--border-color)",
                        backgroundColor: selectedDoctor?.id === doc.id ? "var(--accent-glow)" : "rgba(255,255,255,0.01)",
                      }}
                    >
                      <div>
                        <strong style={{ color: "var(--text-primary)" }}>Dr. {doc.name}</strong>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {doc.doctorProfile?.specialisation} ({doc.doctorProfile?.slotDuration} min)
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </DashboardCard>

            {/* Medication Reminders panel */}
            <DashboardCard title="Medication Reminders" icon={<Pill size={18} />}>
              {reminders.length === 0 ? (
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No active medication reminders configured.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {reminders.map((rem) => (
                    <div key={rem.id} className="reminder-tile">
                      <div>
                        <strong style={{ color: rem.active ? "var(--text-primary)" : "var(--text-muted)" }}>
                          {rem.drugName} ({rem.dosage})
                        </strong>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          Freq: {rem.frequency.replace("_", " ")}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          Schedule: {rem.timeOfDay}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <label className="switch" style={{ position: "relative", display: "inline-block", width: "40px", height: "20px" }}>
                          <input
                            type="checkbox"
                            checked={rem.active}
                            onChange={() => handleToggleReminder(rem.id, rem.active)}
                            style={{ opacity: 0, width: 0, height: 0 }}
                          />
                          <span style={{
                            position: "absolute",
                            cursor: "pointer",
                            top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: rem.active ? "var(--success)" : "var(--bg-tertiary)",
                            transition: ".3s",
                            borderRadius: "20px",
                            border: "1px solid var(--border-color)"
                          }}>
                            <span style={{
                              position: "absolute",
                              content: '""',
                              height: "14px", width: "14px",
                              left: rem.active ? "22px" : "3px",
                              bottom: "2px",
                              backgroundColor: "#fff",
                              transition: ".3s",
                              borderRadius: "50%"
                            }}></span>
                          </span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          </div>

          {/* Main Dashboard - Slot Picker or Bookings List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            {selectedDoctor && (
              <div className="glass-card" style={{ border: "1px solid var(--accent-color)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                  <div>
                    <span className="badge badge-low" style={{ marginBottom: "0.25rem" }}>Scheduler Mode</span>
                    <h3 style={{ fontSize: "1.25rem" }}>Schedule Visit: Dr. {selectedDoctor.name}</h3>
                    <p style={{ fontSize: "0.85rem" }}>
                      Specialisation: <strong>{selectedDoctor.doctorProfile?.specialisation}</strong> | Working Hours: {selectedDoctor.doctorProfile?.workingHoursStart} - {selectedDoctor.doctorProfile?.workingHoursEnd}
                    </p>
                  </div>
                  <button onClick={() => setSelectedDoctor(null)} className="btn btn-secondary" style={{ padding: "0.4rem" }}>
                    <X size={14} />
                  </button>
                </div>

                <SlotPicker
                  doctorId={selectedDoctor.id}
                  onSlotHeld={handleSlotHeld}
                  onError={(msg) => setError(msg)}
                />
              </div>
            )}

            {/* Upcoming visits */}
            <div className="glass-card">
              <h3 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "1rem" }}>Upcoming Appointments</h3>
              {upcomingAppts.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>No upcoming appointments scheduled.</p>
              ) : (
                <div className="table-container">
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>Doctor</th>
                        <th>Specialisation</th>
                        <th>Scheduled Time</th>
                        <th>Status</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingAppts.map((appt) => (
                        <tr key={appt.id}>
                          <td>
                            <strong>Dr. {appt.doctor.name}</strong>
                          </td>
                          <td>{appt.doctor.doctorProfile?.specialisation || "General Medicine"}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                              <Clock size={13} style={{ color: "var(--accent-color)" }} />
                              {new Date(appt.appointmentTime).toLocaleString()}
                            </div>
                          </td>
                          <td>
                            {appt.status === "PENDING" ? (
                              <span style={{ color: "var(--warning)", fontWeight: "600", fontSize: "0.85rem" }}>Pending Approval</span>
                            ) : (
                              <span style={{ color: "var(--success)", fontWeight: "600", fontSize: "0.85rem" }}>Confirmed</span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              onClick={() => handleCancelAppointment(appt.id, appt.doctor.name)}
                              className="btn btn-danger"
                              style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                            >
                              Cancel Visit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Past visits / Care Plans */}
            <div className="glass-card">
              <h3 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "1rem" }}>Past Visited summaries & Care Plans</h3>
              {pastAppts.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>No past appointments recorded.</p>
              ) : (
                <div className="table-container">
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>Doctor</th>
                        <th>Visit Date</th>
                        <th>Symptom Summary</th>
                        <th>Urgency</th>
                        <th style={{ textAlign: "right" }}>Action plan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastAppts.map((appt) => (
                        <tr key={appt.id}>
                          <td>
                            <strong>Dr. {appt.doctor.name}</strong>
                          </td>
                          <td>{new Date(appt.appointmentTime).toLocaleDateString()}</td>
                          <td>
                            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                              {appt.chiefComplaint || appt.symptoms.slice(0, 45) + "..."}
                            </div>
                          </td>
                          <td>
                            <UrgencyBadge urgency={appt.urgency} />
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {appt.postVisitSummary ? (
                              <button
                                onClick={() => setSelectedCarePlan(appt)}
                                className="btn btn-primary"
                                style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                              >
                                <FileText size={12} />
                                View Summary
                              </button>
                            ) : (
                              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                {appt.status === "BOOKED" ? "Awaiting visit" : appt.status.replace("_", " ")}
                              </span>
                            )}
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

      {/* Symptom Details & Booking Hold Modal */}
      {heldSlotTime && selectedDoctor && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button onClick={() => setHeldSlotTime(null)} className="modal-close">
              <X size={18} />
            </button>
            <h3 style={{ marginBottom: "0.5rem" }}>Brief Symptoms Review</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Please share your symptoms in advance. Dr. {selectedDoctor.name} will review this.
            </p>
            
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem",
              backgroundColor: "var(--warning-glow)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
              borderRadius: "var(--radius-sm)",
              marginBottom: "1.25rem",
              color: "var(--warning)",
              fontSize: "0.9rem",
              fontWeight: "600",
            }}>
              <Clock size={16} />
              <span>
                Lock expires in: {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, "0")}
              </span>
            </div>

            <form onSubmit={handleConfirmBooking} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Tell us about your symptoms *</label>
                <textarea
                  required
                  placeholder="Describe what you are feeling, when it started, and severity (e.g. 'fever and sore throat since yesterday, mild headache')"
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  className="form-textarea"
                  style={{ minHeight: "120px" }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
                  A confirmation and calendar reminder email will be sent to this address when the doctor approves.
                </span>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="submit"
                  disabled={bookingLoading || symptoms.length < 5}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {bookingLoading ? "Analyzing & Booking..." : "Confirm & Book Slot"}
                </button>
                <button
                  type="button"
                  onClick={() => setHeldSlotTime(null)}
                  className="btn btn-secondary"
                >
                  Release Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Care Plan Modal */}
      {selectedCarePlan && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "700px" }}>
            <button onClick={() => setSelectedCarePlan(null)} className="modal-close">
              <X size={18} />
            </button>
            
            <div style={{ display: "flex", justifySelf: "flex-start", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
              <Pill style={{ color: "var(--accent-color)" }} />
              <h3 style={{ fontSize: "1.25rem" }}>Care Plan Summary</h3>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              Visit Date: {new Date(selectedCarePlan.appointmentTime).toLocaleDateString()} | Doctor: <strong>Dr. {selectedCarePlan.doctor.name}</strong>
            </p>

            <div style={{
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              padding: "1.25rem",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              color: "var(--text-primary)",
              maxHeight: "350px",
              overflowY: "auto",
              whiteSpace: "pre-wrap"
            }}>
              {/* Parse and render simple care plan formatting */}
              {selectedCarePlan.postVisitSummary}
            </div>

            <div style={{ marginTop: "1.5rem", textAlign: "right" }}>
              <button onClick={() => setSelectedCarePlan(null)} className="btn btn-secondary">
                Close Care Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
