import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

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
        doctor: true,
      },
    });

    if (!appointment || appointment.doctorId !== session.id) {
      return NextResponse.json({ error: "Appointment not found or unauthorized" }, { status: 404 });
    }

    if (appointment.status !== "PENDING") {
      return NextResponse.json({ error: "Appointment is not pending approval" }, { status: 400 });
    }

    // 1. Update status to REJECTED
    const updatedAppointment = await db.appointment.update({
      where: { id: appointmentId },
      data: { status: "REJECTED" },
    });

    // 2. Send emails (non-blocking)
    const runEmails = async () => {
      const doctor = appointment.doctor;
      const patient = appointment.patient;
      const requestedTime = new Date(appointment.appointmentTime);

      // A. Patient Email Body
      const patientEmailBody = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
          <h2 style="color: #e53e3e;">Appointment Request Declined</h2>
          <p>Dear ${patient.name},</p>
          <p>We regret to inform you that your appointment request with <strong>Dr. ${doctor.name}</strong> on <strong>${requestedTime.toLocaleString()}</strong> has been declined.</p>
          <p>This may be due to schedule conflicts or changes in specialist availability. Please log in to your Patient Portal to search for other available time slots or select another specialist.</p>
          <br/>
          <p>Best regards,<br/>Clinic Coordination Team</p>
        </div>
      `;

      sendEmail({
        to: patient.email,
        subject: `Appointment Request Declined - Dr. ${doctor.name}`,
        html: patientEmailBody,
      }).then(async (success) => {
        await db.notification.create({
          data: {
            recipientEmail: patient.email,
            subject: `Appointment Request Declined - Dr. ${doctor.name}`,
            body: patientEmailBody,
            status: success ? "SENT" : "FAILED",
            errorMessage: success ? null : "Failed to notify patient of rejection",
          },
        });
      }).catch(console.error);

      // B. Doctor Email Body
      const doctorEmailBody = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
          <h2 style="color: #c53030;">Request Declined</h2>
          <p>Dear Dr. ${doctor.name},</p>
          <p>You have declined the appointment request from patient <strong>${patient.name}</strong> scheduled for <strong>${requestedTime.toLocaleString()}</strong>.</p>
          <p>The time slot has been freed and is open to other patients.</p>
          <br/>
          <p>Best regards,<br/>Clinic Coordination System</p>
        </div>
      `;

      sendEmail({
        to: doctor.email,
        subject: `Request Declined: ${patient.name}`,
        html: doctorEmailBody,
      }).then(async (success) => {
        await db.notification.create({
          data: {
            recipientEmail: doctor.email,
            subject: `Request Declined: ${patient.name}`,
            body: doctorEmailBody,
            status: success ? "SENT" : "FAILED",
            errorMessage: success ? null : "Failed to send doctor rejection confirmation",
          },
        });
      }).catch(console.error);
    };

    runEmails().catch(console.error);

    return NextResponse.json({ success: true, appointment: updatedAppointment });
  } catch (error: any) {
    console.error("Reject appointment error:", error);
    return NextResponse.json({ error: error.message || "Failed to reject appointment" }, { status: 500 });
  }
}
