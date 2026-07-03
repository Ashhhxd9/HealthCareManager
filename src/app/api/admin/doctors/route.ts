import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

// GET all doctors
export async function GET(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const doctors = await db.user.findMany({
      where: { role: "DOCTOR" },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        doctorProfile: true,
      },
    });

    return NextResponse.json(doctors);
  } catch (error: any) {
    console.error("GET doctors error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST create a doctor user + profile
export async function POST(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { name, email, password, specialisation, workingHoursStart, workingHoursEnd, slotDuration } = await req.json();

    if (!name || !email || !password || !specialisation || !workingHoursStart || !workingHoursEnd || !slotDuration) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);

    // Create User (DOCTOR role) and DoctorProfile in transaction
    const doctor = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "DOCTOR",
        },
      });

      const profile = await tx.doctorProfile.create({
        data: {
          userId: user.id,
          specialisation,
          workingHoursStart,
          workingHoursEnd,
          slotDuration: parseInt(slotDuration.toString()),
          leaveDays: "",
        },
      });

      return { ...user, doctorProfile: profile };
    });

    return NextResponse.json({ success: true, doctor });
  } catch (error: any) {
    console.error("Create doctor error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
