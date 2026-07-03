import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let appointments: any[] = [];

    if (session.role === "PATIENT") {
      appointments = await db.appointment.findMany({
        where: { patientId: session.id },
        include: {
          doctor: {
            select: { name: true, email: true, doctorProfile: true },
          },
        },
        orderBy: { appointmentTime: "asc" },
      });
    } else if (session.role === "DOCTOR") {
      appointments = await db.appointment.findMany({
        where: { doctorId: session.id },
        include: {
          patient: {
            select: { name: true, email: true },
          },
        },
        orderBy: { appointmentTime: "asc" },
      });
    } else if (session.role === "ADMIN") {
      appointments = await db.appointment.findMany({
        include: {
          patient: { select: { name: true, email: true } },
          doctor: { select: { name: true, email: true } },
        },
        orderBy: { appointmentTime: "desc" },
      });
    }

    return NextResponse.json(appointments);
  } catch (error) {
    console.error("GET appointments list error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
