import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const forceHourStr = searchParams.get("forceHour");
    const testReminders = searchParams.get("test") === "true";

    const results = {
      holdsCleaned: 0,
      emailsRetried: 0,
      medRemindersSent: 0,
      errors: [] as string[],
    };

    const now = new Date();

    // 1. CLEAN UP EXPIRED SLOT HOLDS
    try {
      const deletedHolds = await db.slotHold.deleteMany({
        where: {
          expiresAt: {
            lte: now,
          },
        },
      });
      results.holdsCleaned = deletedHolds.count;
    } catch (err: any) {
      results.errors.push(`Slot holds cleanup failed: ${err.message}`);
    }

    // 2. RETRY FAILED EMAIL NOTIFICATIONS
    try {
      const failedEmails = await db.notification.findMany({
        where: {
          status: "FAILED",
          retryCount: {
            lt: 3, // Max 3 retries
          },
        },
        take: 10, // Process in small batches
      });

      for (const email of failedEmails) {
        const nextRetry = email.retryCount + 1;
        
        // Attempt resend
        const success = await sendEmail({
          to: email.recipientEmail,
          subject: email.subject,
          html: email.body,
        });

        await db.notification.update({
          where: { id: email.id },
          data: {
            retryCount: nextRetry,
            status: success ? "SENT" : "FAILED",
            errorMessage: success ? null : `Retry #${nextRetry} failed.`,
          },
        });

        if (success) results.emailsRetried++;
      }
    } catch (err: any) {
      results.errors.push(`Email retries failed: ${err.message}`);
    }

    // 3. MEDICATION REMINDERS
    try {
      // Find what hour it is locally (0-23)
      let currentHour = now.getHours();
      
      if (forceHourStr !== null) {
        currentHour = parseInt(forceHourStr);
      }

      // Format hour as two digit string (e.g. "08")
      const currentHourStr = currentHour.toString().padStart(2, "0") + ":00";

      // If test is true, we fetch all active reminders. Otherwise, we fetch reminders matching this hour.
      const queryConditions: any = { active: true };
      
      if (!testReminders && forceHourStr === null) {
        // Match hour substring in timeOfDay serialized list (e.g. "08:00,20:00")
        queryConditions.timeOfDay = {
          contains: currentHourStr,
        };
      }

      const activeReminders = await db.medicationReminder.findMany({
        where: queryConditions,
        include: { patient: true },
      });

      for (const reminder of activeReminders) {
        // Avoid sending duplicate reminders in the same hour block
        if (reminder.lastSentAt) {
          const hoursSinceLast = (now.getTime() - new Date(reminder.lastSentAt).getTime()) / (1000 * 60 * 60);
          if (hoursSinceLast < 2 && !testReminders) {
            // Skip sending if sent less than 2 hours ago
            continue;
          }
        }

        const emailSubject = `💊 Medication Reminder: ${reminder.drugName}`;
        const emailHtml = `
          <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
            <h2 style="color: #319795; border-bottom: 2px solid #319795; padding-bottom: 8px;">Time to take your medication</h2>
            <p>Dear ${reminder.patient.name},</p>
            <p>This is your scheduled reminder to take your prescribed medication.</p>
            <div style="background-color: #e6fffa; border: 1px solid #b2f5ea; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 4px 0;"><strong>Medication:</strong> ${reminder.drugName}</p>
              <p style="margin: 4px 0;"><strong>Dosage:</strong> ${reminder.dosage}</p>
              <p style="margin: 4px 0;"><strong>Schedule:</strong> ${reminder.frequency.replace("_", " ")}</p>
            </div>
            <p style="font-size: 13px; color: #718096;">Please make sure to follow the doctor's instructions exactly. If you experience adverse side-effects, contact your doctor.</p>
            <br/>
            <p>Best regards,<br/>Clinic Wellness Team</p>
          </div>
        `;

        // Send email
        const success = await sendEmail({
          to: reminder.patient.email,
          subject: emailSubject,
          html: emailHtml,
        });

        // Log notification record in db
        await db.notification.create({
          data: {
            recipientEmail: reminder.patient.email,
            subject: emailSubject,
            body: emailHtml,
            status: success ? "SENT" : "FAILED",
            errorMessage: success ? null : "Medication reminder delivery failure",
          },
        });

        // Update reminder's last sent timestamp
        await db.medicationReminder.update({
          where: { id: reminder.id },
          data: { lastSentAt: now },
        });

        results.medRemindersSent++;
      }
    } catch (err: any) {
      results.errors.push(`Medication reminders failed: ${err.message}`);
    }

    // 4. UPCOMING APPOINTMENT REMINDERS (Sends reminders to both Patient and Doctor 24 hours before)
    try {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const upcomingAppointments = await db.appointment.findMany({
        where: {
          status: "BOOKED",
          appointmentTime: {
            gte: now,
            lte: tomorrow,
          },
          // Exclude visits already completed by notes check
          postVisitNotes: null,
        },
        include: {
          patient: true,
          doctor: true,
        },
      });

      for (const appt of upcomingAppointments) {
        // Unique tracking key per appointment to prevent double reminding
        const reminderSubject = `Upcoming Appointment Reminder: Appt #${appt.id}`;
        
        const sentReminder = await db.notification.findFirst({
          where: {
            recipientEmail: appt.patient.email,
            subject: reminderSubject,
            status: "SENT",
          },
        });

        if (sentReminder) {
          continue; // Already processed
        }

        // A. Email to Patient
        const patientBody = `
          <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
            <h2 style="color: #2b6cb0; border-bottom: 2px solid #2b6cb0; padding-bottom: 8px;">Upcoming Appointment Reminder</h2>
            <p>Dear ${appt.patient.name},</p>
            <p>This is a friendly reminder that you have a scheduled appointment with <strong>Dr. ${appt.doctor.name}</strong> tomorrow.</p>
            <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 4px 0;"><strong>Date & Time:</strong> ${new Date(appt.appointmentTime).toLocaleString()}</p>
              <p style="margin: 4px 0;"><strong>Specialist:</strong> Dr. ${appt.doctor.name}</p>
              <p style="margin: 4px 0;"><strong>Reported Symptoms:</strong> ${appt.symptoms}</p>
            </div>
            <p style="font-size: 13px; color: #718096;">Please arrive 10 minutes prior to your scheduled slot. If you need to cancel, please manage it from your Patient Portal.</p>
            <br/>
            <p>Best regards,<br/>Clinic Care Team</p>
          </div>
        `;
        const patientSuccess = await sendEmail({
          to: appt.patient.email,
          subject: `Reminder: Appointment with Dr. ${appt.doctor.name} Tomorrow`,
          html: patientBody,
        });

        await db.notification.create({
          data: {
            recipientEmail: appt.patient.email,
            subject: reminderSubject,
            body: patientBody,
            status: patientSuccess ? "SENT" : "FAILED",
            errorMessage: patientSuccess ? null : "Patient reminder delivery failure",
          },
        });

        // B. Email to Doctor
        const doctorBody = `
          <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
            <h2 style="color: #2b6cb0; border-bottom: 2px solid #2b6cb0; padding-bottom: 8px;">Upcoming Schedule Reminder</h2>
            <p>Dear Dr. ${appt.doctor.name},</p>
            <p>This is a reminder that patient <strong>${appt.patient.name}</strong> is scheduled in your calendar tomorrow.</p>
            <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 4px 0;"><strong>Date & Time:</strong> ${new Date(appt.appointmentTime).toLocaleString()}</p>
              <p style="margin: 4px 0;"><strong>Patient:</strong> ${appt.patient.name} (${appt.patient.email})</p>
              <p style="margin: 4px 0;"><strong>AI Urgency Flag:</strong> <strong style="color: ${appt.urgency === "High" ? "#e53e3e" : appt.urgency === "Medium" ? "#dd6b20" : "#38a169"}">${appt.urgency || "Low"}</strong></p>
              <p style="margin: 4px 0;"><strong>Chief Complaint:</strong> ${appt.chiefComplaint || "Checkup"}</p>
            </div>
            <p style="font-size: 13px; color: #718096;">Please log in to your Specialist Portal to review their symptoms and pre-visit analysis questions.</p>
            <br/>
            <p>Best regards,<br/>Clinic Coordination System</p>
          </div>
        `;
        const doctorSuccess = await sendEmail({
          to: appt.doctor.email,
          subject: `Reminder: Appointment with ${appt.patient.name} Tomorrow`,
          html: doctorBody,
        });

        await db.notification.create({
          data: {
            recipientEmail: appt.doctor.email,
            subject: reminderSubject,
            body: doctorBody,
            status: doctorSuccess ? "SENT" : "FAILED",
            errorMessage: doctorSuccess ? null : "Doctor reminder delivery failure",
          },
        });

        results.emailsRetried += 2; // Track reminders sent
      }
    } catch (err: any) {
      results.errors.push(`Upcoming appointment reminders failed: ${err.message}`);
    }

    return NextResponse.json({
      success: results.errors.length === 0,
      results,
    });
  } catch (error: any) {
    console.error("Jobs running error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
