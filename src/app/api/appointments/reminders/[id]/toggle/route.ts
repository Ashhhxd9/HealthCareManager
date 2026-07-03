import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "PATIENT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const { active } = await req.json();

    const reminder = await db.medicationReminder.findUnique({
      where: { id },
    });

    if (!reminder || reminder.patientId !== session.id) {
      return NextResponse.json({ error: "Reminder not found or unauthorized" }, { status: 404 });
    }

    const updated = await db.medicationReminder.update({
      where: { id },
      data: { active: !!active },
    });

    return NextResponse.json({ success: true, reminder: updated });
  } catch (error: any) {
    console.error("Toggle reminder error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
