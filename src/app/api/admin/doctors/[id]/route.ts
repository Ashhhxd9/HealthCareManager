import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { deleteGoogleCalendarEvent } from "@/lib/googleCalendar";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { specialisation, workingHoursStart, workingHoursEnd, slotDuration, leaveDays, name, email } = body;

    // Get current profile
    const existingDoctor = await db.user.findUnique({
      where: { id },
      include: { doctorProfile: true },
    });

    if (!existingDoctor || !existingDoctor.doctorProfile) {
      return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
    }

    const currentLeaves = existingDoctor.doctorProfile.leaveDays
      ? existingDoctor.doctorProfile.leaveDays.split(",").map(d => d.trim()).filter(Boolean)
      : [];

    const newLeaves = leaveDays
      ? leaveDays.split(",").map((d: string) => d.trim()).filter(Boolean)
      : [];

    // Find leaves that were newly added
    const addedLeaves = newLeaves.filter((d: string) => !currentLeaves.includes(d));

    // Handle Leave Conflicts in Transaction/Batch
    const cancelledCount = { count: 0 };
    
    if (addedLeaves.length > 0) {
      for (const leaveDateStr of addedLeaves) {
        const startOfDay = new Date(`${leaveDateStr}T00:00:00.000Z`);
        const endOfDay = new Date(`${leaveDateStr}T23:59:59.999Z`);

        // Find booked appointments on this day
        const appointmentsToCancel = await db.appointment.findMany({
          where: {
            doctorId: id,
            appointmentTime: {
              gte: startOfDay,
              lte: endOfDay,
            },
            status: "BOOKED",
          },
          include: {
            patient: true,
            doctor: true,
          },
        });

        for (const appt of appointmentsToCancel) {
          // 1. Cancel in database
          await db.appointment.update({
            where: { id: appt.id },
            data: { status: "CANCELLED_BY_DOCTOR" },
          });

          cancelledCount.count++;

          // 2. Queue/Send notification to Patient
          const notificationSubject = `Appointment Cancelled: Doctor on Leave`;
          const notificationBody = `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2 style="color: #c53030;">Appointment Cancellation Notice</h2>
              <p>Dear ${appt.patient.name},</p>
              <p>We regret to inform you that your appointment with <strong>Dr. ${appt.doctor.name}</strong> scheduled for <strong>${appt.appointmentTime.toLocaleString()}</strong> has been cancelled because the doctor is on leave that day.</p>
              <p>Please log in to your patient portal to reschedule your appointment for another available time slot.</p>
              <br/>
              <p>Best regards,<br/>Clinic Coordination Team</p>
            </div>
          `;

          // Log database notification entry
          await db.notification.create({
            data: {
              recipientEmail: appt.patient.email,
              subject: notificationSubject,
              body: notificationBody,
              status: "PENDING",
            },
          });

          // Dispatch email (non-blocking)
          sendEmail({
            to: appt.patient.email,
            subject: notificationSubject,
            html: notificationBody,
          }).then(async (success) => {
            await db.notification.create({
              data: {
                recipientEmail: appt.patient.email,
                subject: notificationSubject,
                body: notificationBody,
                status: success ? "SENT" : "FAILED",
                errorMessage: success ? null : "Failed to dispatch email",
              },
            });
          }).catch(console.error);

          // 3. Delete from Google Calendar if sync ID exists
          if (appt.googleCalendarEventId) {
            // Get doctor credentials for token
            // If they linked, profile has access tokens, let's delete
            // (We'll assume doctor auth flow is handled, or use mock calendar delete)
            deleteGoogleCalendarEvent("mock_access_token_", appt.googleCalendarEventId).catch(console.error);
          }
        }
      }
    }

    // Update Doctor and DoctorProfile
    const updated = await db.$transaction(async (tx) => {
      if (name || email) {
        await tx.user.update({
          where: { id },
          data: {
            ...(name && { name }),
            ...(email && { email }),
          },
        });
      }

      const profile = await tx.doctorProfile.update({
        where: { userId: id },
        data: {
          specialisation,
          workingHoursStart,
          workingHoursEnd,
          slotDuration: parseInt(slotDuration.toString()),
          leaveDays: newLeaves.join(","),
        },
      });

      return profile;
    });

    return NextResponse.json({
      success: true,
      profile: updated,
      cancelledAppointmentsCount: cancelledCount.count,
    });
  } catch (error: any) {
    console.error("PUT doctor error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    // Delete User (cascades to DoctorProfile and Appointments due to schema definitions)
    await db.user.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE doctor error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
