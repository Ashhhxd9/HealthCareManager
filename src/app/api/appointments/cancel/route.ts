import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { deleteGoogleCalendarEvent, refreshAccessToken } from "@/lib/googleCalendar";

export async function POST(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { appointmentId } = await req.json();
    if (!appointmentId) {
      return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
    }

    const appointment = await db.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: {
          include: { doctorProfile: true },
        },
      },
    });

    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    // Verify permission
    const isPatient = session.role === "PATIENT" && appointment.patientId === session.id;
    const isDoctor = session.role === "DOCTOR" && appointment.doctorId === session.id;
    const isAdmin = session.role === "ADMIN";

    if (!isPatient && !isDoctor && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const cancelStatus = session.role === "PATIENT"
      ? "CANCELLED_BY_PATIENT"
      : session.role === "DOCTOR"
      ? "CANCELLED_BY_DOCTOR"
      : "CANCELLED";

    // Update appointment status
    await db.appointment.update({
      where: { id: appointmentId },
      data: { status: cancelStatus },
    });

    // Run async sync operations (Calendar delete and Email dispatch)
    const handleSync = async () => {
      // 1. Google Calendar Event Delete
      if (appointment.googleCalendarEventId) {
        if (appointment.doctor.doctorProfile?.googleRefreshToken) {
          try {
            const accessToken = await refreshAccessToken(appointment.doctor.doctorProfile.googleRefreshToken);
            await deleteGoogleCalendarEvent(accessToken, appointment.googleCalendarEventId);
          } catch (calErr) {
            console.error("Failed to delete Google Calendar Event:", calErr);
            // fallback mock action
            await deleteGoogleCalendarEvent("mock_access_token_", appointment.googleCalendarEventId);
          }
        } else {
          await deleteGoogleCalendarEvent("mock_access_token_", appointment.googleCalendarEventId);
        }
      }

      // 2. Email Notifications
      const cancelledByStr = session.role === "PATIENT" ? "Patient" : session.role === "DOCTOR" ? "Doctor" : "Administrator";
      
      const emailHtml = `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #c53030;">Appointment Cancelled</h2>
          <p>This is to confirm that the appointment has been cancelled by the <strong>${cancelledByStr}</strong>.</p>
          <hr/>
          <p><strong>Patient Name:</strong> ${appointment.patient.name}</p>
          <p><strong>Doctor Name:</strong> Dr. ${appointment.doctor.name}</p>
          <p><strong>Scheduled Time:</strong> ${appointment.appointmentTime.toLocaleString()}</p>
          <hr/>
          <p>If this was unexpected, please feel free to reschedule by booking a new slot.</p>
          <br/>
          <p>Best regards,<br/>Clinic Care System</p>
        </div>
      `;

      // Send to patient
      sendEmail({
        to: appointment.patient.email,
        subject: `Appointment Cancelled - Dr. ${appointment.doctor.name}`,
        html: emailHtml,
      }).then(async (success) => {
        await db.notification.create({
          data: {
            recipientEmail: appointment.patient.email,
            subject: `Appointment Cancelled - Dr. ${appointment.doctor.name}`,
            body: emailHtml,
            status: success ? "SENT" : "FAILED",
            errorMessage: success ? null : "Failed to notify patient of cancellation",
          },
        });
      }).catch(console.error);

      // Send to doctor
      sendEmail({
        to: appointment.doctor.email,
        subject: `Appointment Cancelled - ${appointment.patient.name}`,
        html: emailHtml,
      }).then(async (success) => {
        await db.notification.create({
          data: {
            recipientEmail: appointment.doctor.email,
            subject: `Appointment Cancelled - ${appointment.patient.name}`,
            body: emailHtml,
            status: success ? "SENT" : "FAILED",
            errorMessage: success ? null : "Failed to notify doctor of cancellation",
          },
        });
      }).catch(console.error);
    };

    handleSync().catch(console.error);

    return NextResponse.json({ success: true, message: "Appointment successfully cancelled" });
  } catch (error: any) {
    console.error("Cancel appointment error:", error);
    return NextResponse.json({ error: error.message || "Failed to cancel appointment" }, { status: 500 });
  }
}
