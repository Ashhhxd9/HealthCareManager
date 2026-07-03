import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { comparePassword, signToken, hashPassword } from "@/lib/auth";

async function ensureDefaultUsers() {
  const hashedPassword = await hashPassword("password");

  // 1. Ensure Default Admin
  const adminExists = await db.user.findUnique({ where: { email: "admin@test.com" } });
  if (!adminExists) {
    await db.user.create({
      data: {
        name: "Default Admin",
        email: "admin@test.com",
        password: hashedPassword,
        role: "ADMIN",
      },
    });
    console.log("[Seeding] Created Default Admin account admin@test.com");
  }

  // 2. Ensure Default Doctor
  const doctorExists = await db.user.findUnique({ where: { email: "alice@test.com" } });
  if (!doctorExists) {
    const doctor = await db.user.create({
      data: {
        name: "Dr. Alice Smith",
        email: "alice@test.com",
        password: hashedPassword,
        role: "DOCTOR",
      },
    });

    await db.doctorProfile.create({
      data: {
        userId: doctor.id,
        specialisation: "Cardiology",
        workingHoursStart: "09:00",
        workingHoursEnd: "17:00",
        slotDuration: 30,
        leaveDays: "[]",
      },
    });
    console.log("[Seeding] Created Default Doctor account alice@test.com");
  }

  // 3. Ensure Default Patient
  const patientExists = await db.user.findUnique({ where: { email: "bob@test.com" } });
  if (!patientExists) {
    await db.user.create({
      data: {
        name: "Bob Ross",
        email: "bob@test.com",
        password: hashedPassword,
        role: "PATIENT",
      },
    });
    console.log("[Seeding] Created Default Patient account bob@test.com");
  }
}

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
    }

    // Dynamic Seeder: Assures that default accounts always exist in the database
    // to prevent invalid credentials on manual db wipes or partial registries.
    await ensureDefaultUsers();

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });

    response.headers.append(
      "Set-Cookie",
      `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}; Secure=${process.env.NODE_ENV === "production"}`
    );

    return response;
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
