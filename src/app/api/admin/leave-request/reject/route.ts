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
      include: { doctor: true },
    });

    if (!request) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }

    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Leave request is already resolved" }, { status: 400 });
    }

    // 1. Update LeaveRequest status to REJECTED
    await db.leaveRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED" },
    });

    // 2. Email doctor (non-blocking)
    const sendRejectionEmail = async () => {
      const doctorSubject = `Leave Request Declined: ${request.leaveDate}`;
      const doctorBody = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
          <h2 style="color: #e53e3e;">Leave Request Declined</h2>
          <p>Dear Dr. ${request.doctor.name},</p>
          <p>Your request for leave on <strong>${request.leaveDate}</strong> has been <strong>declined</strong> by the administrator.</p>
          <p>Please contact the administration office if you believe this was in error or require further assistance.</p>
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
    };

    sendRejectionEmail().catch(console.error);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Reject leave error:", error);
    return NextResponse.json({ error: error.message || "Failed to reject leave request" }, { status: 500 });
  }
}
