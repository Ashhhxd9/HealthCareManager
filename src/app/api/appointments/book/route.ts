import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { generatePreVisitSummary } from "@/lib/llm";
import { sendEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "PATIENT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { doctorId, slotTime, symptoms, email } = await req.json();

    if (!doctorId || !slotTime || !symptoms || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const requestedTime = new Date(slotTime);
    const now = new Date();

    // 1. Verify that the user holds this slot currently
    const activeHold = await db.slotHold.findFirst({
      where: {
        doctorId,
        slotTime: requestedTime,
        heldById: session.id,
        expiresAt: {
          gt: now,
        },
      },
    });

    if (!activeHold) {
      return NextResponse.json({ error: "Slot hold has expired or is invalid. Please select the slot again." }, { status: 400 });
    }

    // Update patient email to match confirmed email entered in form
    await db.user.update({
      where: { id: session.id },
      data: { email },
    });

    // 2. Generate LLM Pre-visit summary (failsafe)
    let aiSummary = {
      urgency: "Medium" as "Low" | "Medium" | "High",
      chiefComplaint: "Symptom check",
      suggestedQuestions: [] as string[],
    };

    try {
      aiSummary = await generatePreVisitSummary(symptoms);
    } catch (llmError) {
      console.warn("LLM summary generation failed during booking. Proceeding with fallback.", llmError);
    }

    // Fetch Doctor and Patient details
    const doctor = await db.user.findUnique({
      where: { id: doctorId },
      include: { doctorProfile: true },
    });

    const patient = await db.user.findUnique({
      where: { id: session.id },
    });

    if (!doctor || !doctor.doctorProfile || !patient) {
      return NextResponse.json({ error: "Doctor or Patient record not found" }, { status: 404 });
    }

    // 3. Confirm booking inside transaction as "PENDING"
    const appointment = await db.$transaction(async (tx) => {
      // Re-verify no other BOOKED or PENDING appointment exists at this slot
      const existingAppt = await tx.appointment.findFirst({
        where: {
          doctorId,
          appointmentTime: requestedTime,
          status: { in: ["BOOKED", "PENDING"] },
        },
      });

      if (existingAppt) {
        throw new Error("This slot was already booked by another user");
      }

      // Delete hold
      await tx.slotHold.delete({
        where: { id: activeHold.id },
      });

      // Create appointment with PENDING status
      return tx.appointment.create({
        data: {
          patientId: session.id,
          doctorId,
          appointmentTime: requestedTime,
          status: "PENDING", // Start in pending approval review state
          symptoms,
          urgency: aiSummary.urgency,
          chiefComplaint: aiSummary.chiefComplaint,
          suggestedQuestions: JSON.stringify(aiSummary.suggestedQuestions),
        },
      });
    });

    // 4. Send Pending Email notifications to Patient and Doctor (non-blocking)
    const sendPendingNotifications = async () => {
      // A. Patient Email Body
      const patientEmailBody = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
          <h2 style="color: #dd6b20;">Appointment Request Pending Review</h2>
          <p>Dear ${patient.name},</p>
          <p>Your request to schedule an appointment with <strong>Dr. ${doctor.name}</strong> (${doctor.doctorProfile!.specialisation}) has been received.</p>
          <div style="background-color: #fffaf0; border: 1px solid #feebc8; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 4px 0;"><strong>Requested Time:</strong> ${requestedTime.toLocaleString()}</p>
            <p style="margin: 4px 0;"><strong>Symptoms:</strong> ${symptoms}</p>
            <p style="margin: 4px 0;"><strong>AI Urgency Flag:</strong> <strong>${aiSummary.urgency}</strong></p>
          </div>
          <p><strong>Note:</strong> Your appointment is currently <strong>pending review</strong> by the doctor. You will receive another email as soon as the specialist reviews and approves your request.</p>
          <br/>
          <p>Thank you,<br/>Clinic Care Team</p>
        </div>
      `;

      sendEmail({
        to: email, // use submitted form email address
        subject: `Booking Request Pending: Dr. ${doctor.name}`,
        html: patientEmailBody,
      }).then(async (success) => {
        await db.notification.create({
          data: {
            recipientEmail: email,
            subject: `Booking Request Pending: Dr. ${doctor.name}`,
            body: patientEmailBody,
            status: success ? "SENT" : "FAILED",
            errorMessage: success ? null : "Failed to notify patient of pending status",
          },
        });
      }).catch(console.error);

      // B. Doctor Email Body
      const doctorEmailBody = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
          <h2 style="color: #2b6cb0;">New Appointment Request</h2>
          <p>Dear Dr. ${doctor.name},</p>
          <p>A new patient, <strong>${patient.name}</strong>, has requested an appointment slot in your schedule.</p>
          <div style="background-color: #ebf8ff; border: 1px solid #bee3f8; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 4px 0;"><strong>Requested Time:</strong> ${requestedTime.toLocaleString()}</p>
            <p style="margin: 4px 0;"><strong>Symptoms:</strong> ${symptoms}</p>
            <p style="margin: 4px 0;"><strong>AI Urgency:</strong> <strong style="color: ${aiSummary.urgency === "High" ? "#e53e3e" : aiSummary.urgency === "Medium" ? "#dd6b20" : "#38a169"}">${aiSummary.urgency}</strong></p>
            <p style="margin: 4px 0;"><strong>AI Chief Complaint:</strong> ${aiSummary.chiefComplaint}</p>
          </div>
          <p>Please log in to your Specialist Portal to review their symptoms and Approve or Reject this request.</p>
          <br/>
          <p>Best regards,<br/>Clinic Automation System</p>
        </div>
      `;

      sendEmail({
        to: doctor.email,
        subject: `New Request Pending: ${patient.name}`,
        html: doctorEmailBody,
      }).then(async (success) => {
        await db.notification.create({
          data: {
            recipientEmail: doctor.email,
            subject: `New Request Pending: ${patient.name}`,
            body: doctorEmailBody,
            status: success ? "SENT" : "FAILED",
            errorMessage: success ? null : "Failed to notify doctor of pending status",
          },
        });
      }).catch(console.error);
    };

    sendPendingNotifications().catch(console.error);

    return NextResponse.json({ success: true, appointment });
  } catch (error: any) {
    console.error("Confirm booking error:", error);
    return NextResponse.json({ error: error.message || "Failed to confirm booking request" }, { status: 500 });
  }
}
