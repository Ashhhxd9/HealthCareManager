import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { requestId } = await req.json();
    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
    }

    const request = await db.leaveRequest.findUnique({
      where: { id: requestId },
      include: { doctor: { include: { doctorProfile: true } } },
    });

    if (!request) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }

    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Leave request is already resolved" }, { status: 400 });
    }

    const doctorId = request.doctorId;
    const leaveDateStr = request.leaveDate;
    const profile = request.doctor.doctorProfile;

    if (!profile) {
      return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
    }

    // 1. Calculate updated leaveDays string
    const currentLeaves = profile.leaveDays
      ? profile.leaveDays.split(",").map(d => d.trim()).filter(Boolean)
      : [];
    
    if (!currentLeaves.includes(leaveDateStr)) {
      currentLeaves.push(leaveDateStr);
    }
    
    const updatedLeaveDays = currentLeaves.join(",");

    // 2. Resolve conflicting appointments on this leave day
    const startOfDay = new Date(`${leaveDateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${leaveDateStr}T23:59:59.999Z`);

    const appointmentsToCancel = await db.appointment.findMany({
      where: {
        doctorId,
        appointmentTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: { in: ["BOOKED", "PENDING"] },
      },
      include: { patient: true },
    });

    let cancelledCount = 0;

    await db.$transaction(async (tx) => {
      // Update LeaveRequest status
      await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED" },
      });

      // Update Doctor Profile
      await tx.doctorProfile.update({
        where: { userId: doctorId },
        data: { leaveDays: updatedLeaveDays },
      });

      // Cancel appointments
      for (const appt of appointmentsToCancel) {
        await tx.appointment.update({
          where: { id: appt.id },
          data: { status: "CANCELLED_BY_DOCTOR" },
        });
        cancelledCount++;
      }
    });

    // 3. Send Emails (non-blocking)
    const sendEmailsAsync = async () => {
      // A. Notify doctor that leave is approved
      const doctorSubject = `Leave Request Approved: ${leaveDateStr}`;
      const doctorBody = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
          <h2 style="color: #38a169;">Leave Request Approved</h2>
          <p>Dear Dr. ${request.doctor.name},</p>
          <p>Your request for leave on <strong>${leaveDateStr}</strong> has been <strong>approved</strong> by the administrator.</p>
          <p>Your calendar availability for this date has been blocked. ${cancelledCount} conflicting appointment bookings were cancelled and affected patients have been notified.</p>
          <br/>
          <p>Best regards,<br/>Clinic Administration</p>
        </div>
      `;

      sendEmail({
        to: request.doctor.email,
        subject: doctorSubject,
        html: doctorBody,
      }).then(async (success) => {
        await db.notification.create({
          data: {
            recipientEmail: request.doctor.email,
            subject: doctorSubject,
            body: doctorBody,
            status: success ? "SENT" : "FAILED",
          },
        });
      }).catch(console.error);

      // B. Notify affected patients
      for (const appt of appointmentsToCancel) {
        const patientSubject = `Appointment Cancelled: Doctor Leave Approved`;
        const patientBody = `
          <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
            <h2 style="color: #e53e3e;">Appointment Cancellation Notice</h2>
            <p>Dear ${appt.patient.name},</p>
            <p>We regret to inform you that your appointment request with <strong>Dr. ${request.doctor.name}</strong> scheduled for <strong>${new Date(appt.appointmentTime).toLocaleString()}</strong> has been cancelled because the doctor's leave request has been approved.</p>
            <p>Please log in to the Patient Portal to reschedule your visit for another available time slot.</p>
            <br/>
            <p>Best regards,<br/>Clinic Care Team</p>
          </div>
        `;

        sendEmail({
          to: appt.patient.email,
          subject: patientSubject,
          html: patientBody,
        }).then(async (success) => {
          await db.notification.create({
            data: {
              recipientEmail: appt.patient.email,
              subject: patientSubject,
              body: patientBody,
              status: success ? "SENT" : "FAILED",
            },
          });
        }).catch(console.error);
      }
    };

    sendEmailsAsync().catch(console.error);

    return NextResponse.json({ success: true, cancelledCount });
  } catch (error: any) {
    console.error("Approve leave error:", error);
    return NextResponse.json({ error: error.message || "Failed to approve leave request" }, { status: 500 });
  }
}
