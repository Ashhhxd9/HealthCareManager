import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "PATIENT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { doctorId, slotTime } = await req.json();

    if (!doctorId || !slotTime) {
      return NextResponse.json({ error: "Missing doctorId or slotTime" }, { status: 400 });
    }

    const requestedTime = new Date(slotTime);
    const now = new Date();

    // Prevent booking slots in the past
    if (requestedTime.getTime() < now.getTime()) {
      return NextResponse.json({ error: "Cannot reserve slots in the past" }, { status: 400 });
    }

    // Try to acquire slot hold inside transaction
    const holdResult = await db.$transaction(async (tx) => {
      // 1. Check if appointment exists
      const existingAppt = await tx.appointment.findFirst({
        where: {
          doctorId,
          appointmentTime: requestedTime,
          status: "BOOKED",
        },
      });

      if (existingAppt) {
        throw new Error("This slot is already booked");
      }

      // 2. Check if active hold exists
      const existingHold = await tx.slotHold.findFirst({
        where: {
          doctorId,
          slotTime: requestedTime,
          expiresAt: {
            gt: now,
          },
        },
      });

      if (existingHold) {
        if (existingHold.heldById === session.id) {
          // If already held by the same patient, extend the hold
          const updatedHold = await tx.slotHold.update({
            where: { id: existingHold.id },
            data: { expiresAt: new Date(now.getTime() + 5 * 60 * 1000) },
          });
          return { hold: updatedHold, message: "Hold extended" };
        }
        throw new Error("This slot is currently held by another patient");
      }

      // 3. Delete any expired holds for this slot to avoid primary key conflicts
      await tx.slotHold.deleteMany({
        where: {
          doctorId,
          slotTime: requestedTime,
        },
      });

      // 4. Create new hold (expires in 5 minutes)
      const hold = await tx.slotHold.create({
        data: {
          doctorId,
          slotTime: requestedTime,
          heldById: session.id,
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000), // 5 minutes TTL
        },
      });

      return { hold, message: "Hold acquired" };
    });

    return NextResponse.json({ success: true, ...holdResult });
  } catch (error: any) {
    console.error("Hold slot error:", error);
    return NextResponse.json({ error: error.message || "Failed to hold slot" }, { status: 400 });
  }
}
