import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PUT(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "DOCTOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { specialisation, workingHoursStart, workingHoursEnd, slotDuration } = body;

    if (!workingHoursStart || !workingHoursEnd || !slotDuration) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const updatedProfile = await db.doctorProfile.update({
      where: { userId: session.id },
      data: {
        specialisation: specialisation || "General Medicine",
        workingHoursStart,
        workingHoursEnd,
        slotDuration: parseInt(slotDuration.toString()),
      },
    });

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (error: any) {
    console.error("Update doctor profile error:", error);
    return NextResponse.json({ error: error.message || "Failed to update profile" }, { status: 500 });
  }
}
