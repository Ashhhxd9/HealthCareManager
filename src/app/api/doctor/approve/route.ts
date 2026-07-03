import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail, generateIcsContent } from "@/lib/email";
import { createGoogleCalendarEvent, refreshAccessToken } from "@/lib/googleCalendar";

export async function POST(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "DOCTOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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

    if (!appointment || appointment.doctorId !== session.id) {
      return NextResponse.json({ error: "Appointment not found or unauthorized" }, { status: 404 });
    }

    if (appointment.status !== "PENDING") {
      return NextResponse.json({ error: "Appointment is not pending approval" }, { status: 400 });
    }

    // 1. Update status to BOOKED
    const updatedAppointment = await db.appointment.update({
      where: { id: appointmentId },
      data: { status: "BOOKED" },
    });

    // 2. Perform Calendar & Email Sync (non-blocking)
    const runSync = async () => {
      let calendarEventId: string | null = null;
      const doctor = appointment.doctor;
      const patient = appointment.patient;
      const requestedTime = new Date(appointment.appointmentTime);
      const slotDuration = doctor.doctorProfile!.slotDuration;
      const endTime = new Date(requestedTime.getTime() + slotDuration * 60 * 1000);

      // A. Google Calendar Event Creation
      if (doctor.doctorProfile!.googleRefreshToken) {
        try {
          const accessToken = await refreshAccessToken(doctor.doctorProfile!.googleRefreshToken!);
          calendarEventId = await createGoogleCalendarEvent(accessToken, {
            id: appointment.id,
            summary: `Appointment: ${patient.name} with Dr. ${doctor.name}`,
            description: `Symptom Details:\n${appointment.symptoms}\n\nAI Urgency Level: ${appointment.urgency}`,
            startTime: requestedTime,
            endTime,
            doctorEmail: doctor.email,
            patientEmail: patient.email,
          });

          if (calendarEventId) {
            await db.appointment.update({
              where: { id: appointment.id },
              data: { googleCalendarEventId: calendarEventId },
            });
          }
        } catch (calErr) {
          console.error("Google Calendar Event failed:", calErr);
        }
      }

      // B. Generate .ics attachment
      const icsString = generateIcsContent({
        id: appointment.id,
        summary: `Specialist Visit with Dr. ${doctor.name}`,
        description: `Your appointment request with Dr. ${doctor.name} has been approved.\nSymptoms: ${appointment.symptoms}`,
        startTime: requestedTime,
        endTime,
        doctorName: doctor.name,
        patientName: patient.name,
      });

      // C. Send confirmation email to patient
      const patientEmailBody = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
          <h2 style="color: #38a169;">Appointment Confirmed!</h2>
          <p>Dear ${patient.name},</p>
          <p>We are pleased to inform you that <strong>Dr. ${doctor.name}</strong> has approved your appointment request.</p>
          <div style="background-color: #f0fff4; border: 1px solid #c6f6d5; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 4px 0;"><strong>Specialist:</strong> Dr. ${doctor.name} (${doctor.doctorProfile!.specialisation})</p>
            <p style="margin: 4px 0;"><strong>Date & Time:</strong> ${requestedTime.toLocaleString()}</p>
            <p style="margin: 4px 0;"><strong>Symptoms:</strong> ${appointment.symptoms}</p>
          </div>
          <p>A calendar invitation file (.ics) is attached to this email. You can add it to your calendar with one click.</p>
          <br/>
          <p>Best regards,<br/>Clinic Care Team</p>
        </div>
      `;

      sendEmail({
        to: patient.email,
        subject: `Appointment Confirmed - Dr. ${doctor.name}`,
        html: patientEmailBody,
        icsAttachment: {
          filename: "appointment.ics",
          content: icsString,
        },
      }).then(async (success) => {
        await db.notification.create({
          data: {
            recipientEmail: patient.email,
            subject: `Appointment Confirmed - Dr. ${doctor.name}`,
            body: patientEmailBody,
            status: success ? "SENT" : "FAILED",
            errorMessage: success ? null : "Failed to notify patient of approval",
          },
        });
      }).catch(console.error);

      // D. Send confirmation email to doctor
      const doctorEmailBody = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
          <h2 style="color: #2b6cb0;">Appointment Request Approved</h2>
          <p>Dear Dr. ${doctor.name},</p>
          <p>You have approved the appointment request from patient <strong>${patient.name}</strong>.</p>
          <div style="background-color: #ebf8ff; border: 1px solid #bee3f8; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 4px 0;"><strong>Patient:</strong> ${patient.name} (${patient.email})</p>
            <p style="margin: 4px 0;"><strong>Scheduled Time:</strong> ${requestedTime.toLocaleString()}</p>
            <p style="margin: 4px 0;"><strong>AI Urgency Flag:</strong> ${appointment.urgency}</p>
          </div>
          <p>The appointment has been locked in your calendar.</p>
          <br/>
          <p>Best regards,<br/>Clinic Coordination System</p>
        </div>
      `;

      sendEmail({
        to: doctor.email,
        subject: `Request Approved: ${patient.name}`,
        html: doctorEmailBody,
      }).then(async (success) => {
        await db.notification.create({
          data: {
            recipientEmail: doctor.email,
            subject: `Request Approved: ${patient.name}`,
            body: doctorEmailBody,
            status: success ? "SENT" : "FAILED",
            errorMessage: success ? null : "Failed to send doctor approval confirmation",
          },
        });
      }).catch(console.error);
    };

    runSync().catch(console.error);

    return NextResponse.json({ success: true, appointment: updatedAppointment });
  } catch (error: any) {
    console.error("Approve appointment error:", error);
    return NextResponse.json({ error: error.message || "Failed to approve appointment" }, { status: 500 });
  }
}
