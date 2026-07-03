import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const doctorId = searchParams.get("doctorId");
    const dateStr = searchParams.get("date"); // YYYY-MM-DD

    if (!doctorId || !dateStr) {
      return NextResponse.json({ error: "Missing doctorId or date" }, { status: 400 });
    }

    const doctor = await db.user.findUnique({
      where: { id: doctorId, role: "DOCTOR" },
      include: { doctorProfile: true },
    });

    if (!doctor || !doctor.doctorProfile) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    }

    const profile = doctor.doctorProfile;

    // Check if doctor is on leave on this date
    const leaves = profile.leaveDays ? profile.leaveDays.split(",").map(d => d.trim()) : [];
    if (leaves.includes(dateStr)) {
      return NextResponse.json({ slots: [], message: "Doctor is on leave this day" });
    }

    // Parse working hours
    const [startHour, startMin] = profile.workingHoursStart.split(":").map(Number);
    const [endHour, endMin] = profile.workingHoursEnd.split(":").map(Number);
    const slotDuration = profile.slotDuration; // in minutes

    // Get all existing appointments on this date
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

    const appointments = await db.appointment.findMany({
      where: {
        doctorId,
        appointmentTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: { in: ["BOOKED", "PENDING"] },
      },
      select: { appointmentTime: true },
    });

    const bookedTimes = appointments.map(appt => appt.appointmentTime.toISOString());

    // Get all active slot holds on this date
    const now = new Date();
    const slotHolds = await db.slotHold.findMany({
      where: {
        doctorId,
        slotTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
        expiresAt: {
          gt: now,
        },
      },
      select: { slotTime: true },
    });

    const heldTimes = slotHolds.map(hold => hold.slotTime.toISOString());

    // Generate slots
    const slots = [];
    let currentSlot = new Date(`${dateStr}T${profile.workingHoursStart.padStart(5, "0")}:00.000Z`);
    const endSlotLimit = new Date(`${dateStr}T${profile.workingHoursEnd.padStart(5, "0")}:00.000Z`);

    // Ensure slot times are correctly formatted in UTC/local relation
    while (currentSlot < endSlotLimit) {
      const slotIso = currentSlot.toISOString();
      const isBooked = bookedTimes.includes(slotIso);
      const isHeld = heldTimes.includes(slotIso);
      const isPast = currentSlot.getTime() < now.getTime();

      let status = "available";
      if (isBooked) status = "booked";
      else if (isHeld) status = "held";
      else if (isPast) status = "past";

      // Formatted local display string (e.g. "09:30 AM")
      const hours = currentSlot.getUTCHours();
      const minutes = currentSlot.getUTCMinutes();
      const ampm = hours >= 12 ? "PM" : "AM";
      const displayHours = hours % 12 === 0 ? 12 : hours % 12;
      const displayStr = `${displayHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")} ${ampm}`;

      slots.push({
        time: slotIso,
        displayTime: displayStr,
        status,
      });

      // Move to next slot
      currentSlot = new Date(currentSlot.getTime() + slotDuration * 60 * 1000);
    }

    return NextResponse.json({ slots });
  } catch (error: any) {
    console.error("GET slots error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
