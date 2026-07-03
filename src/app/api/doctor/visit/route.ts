import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { generatePostVisitSummary } from "@/lib/llm";
import { sendEmail } from "@/lib/email";

interface PrescriptionItem {
  drugName: string;
  dosage: string;
  frequency: "morning" | "night" | "twice_daily" | "thrice_daily";
}

export async function POST(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "DOCTOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { appointmentId, postVisitNotes, prescriptions } = await req.json();

    if (!appointmentId || !postVisitNotes) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const appointment = await db.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: true, doctor: true },
    });

    if (!appointment || appointment.doctorId !== session.id) {
      return NextResponse.json({ error: "Appointment not found or unauthorized" }, { status: 404 });
    }

    // 1. Generate LLM Post-visit summary
    let aiPostVisitSummary = "Visit completed. Please review prescription details.";
    try {
      // Package clinical notes + prescription summary for LLM context
      let notesContext = postVisitNotes;
      if (Array.isArray(prescriptions) && prescriptions.length > 0) {
        notesContext += "\n\nPrescribed Medications:\n" + prescriptions
          .map((p: PrescriptionItem) => `- ${p.drugName} (${p.dosage}), frequency: ${p.frequency}`)
          .join("\n");
      }
      aiPostVisitSummary = await generatePostVisitSummary(notesContext);
    } catch (llmError) {
      console.warn("LLM post-visit summary failed, proceeding with fallback content.", llmError);
    }

    // 2. Perform Database updates in transaction:
    // Update appointment notes/prescription and create medication reminders
    await db.$transaction(async (tx) => {
      // Update appointment
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          postVisitNotes,
          prescription: JSON.stringify(prescriptions || []),
          postVisitSummary: aiPostVisitSummary,
        },
      });

      // Clear any previous active reminders for this patient's same drugs to prevent duplicates
      if (Array.isArray(prescriptions)) {
        for (const item of prescriptions as PrescriptionItem[]) {
          await tx.medicationReminder.deleteMany({
            where: {
              patientId: appointment.patientId,
              drugName: item.drugName,
            },
          });

          // Determine schedule times based on frequency
          let timeOfDay = "08:00"; // default morning
          if (item.frequency === "night") timeOfDay = "20:00";
          else if (item.frequency === "twice_daily") timeOfDay = "08:00,20:00";
          else if (item.frequency === "thrice_daily") timeOfDay = "08:00,14:00,20:00";

          // Create new medication reminder schedule
          await tx.medicationReminder.create({
            data: {
              patientId: appointment.patientId,
              drugName: item.drugName,
              dosage: item.dosage,
              frequency: item.frequency,
              timeOfDay,
              active: true,
            },
          });
        }
      }
    });

    // 3. Email Patient with Post-Visit Summary & Care Plan (non-blocking)
    const emailHtml = `
      <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
        <h2 style="color: #2b6cb0;">Your Visit Summary & Care Plan</h2>
        <p>Dear ${appointment.patient.name},</p>
        <p>Here is the care plan generated from your visit today with <strong>Dr. ${appointment.doctor.name}</strong> on <strong>${appointment.appointmentTime.toLocaleDateString()}</strong>.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
        <div style="background-color: #f7fafc; border-left: 4px solid #4299e1; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
          ${aiPostVisitSummary.replace(/\n/g, "<br/>")}
        </div>
        <p>Medication reminders have been configured in your patient portal. You will receive notifications according to the schedule prescribed.</p>
        <p>If you have any questions or feel worse, please contact the clinic immediately.</p>
        <br/>
        <p>Wishing you a speedy recovery,<br/>Clinic Care Coordination Team</p>
      </div>
    `;

    sendEmail({
      to: appointment.patient.email,
      subject: `Care Plan Summary: Dr. ${appointment.doctor.name}`,
      html: emailHtml,
    }).then(async (success) => {
      await db.notification.create({
        data: {
          recipientEmail: appointment.patient.email,
          subject: `Care Plan Summary: Dr. ${appointment.doctor.name}`,
          body: emailHtml,
          status: success ? "SENT" : "FAILED",
          errorMessage: success ? null : "Failed to email post-visit care plan",
        },
      });
    }).catch(console.error);

    return NextResponse.json({ success: true, postVisitSummary: aiPostVisitSummary });
  } catch (error: any) {
    console.error("Submit visit notes error:", error);
    return NextResponse.json({ error: error.message || "Failed to submit care plan" }, { status: 500 });
  }
}
