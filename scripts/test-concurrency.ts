// Concurrency Test Script
// Running this script tests that our DB-level unique constraint and transactional checks
// prevent double-booking slot holds even under heavy parallel load.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import path from "path";

let dbUrl = process.env.DATABASE_URL || "file:./dev.db";
if (dbUrl.startsWith("file:")) {
  if (dbUrl === "file:./dev.db" || dbUrl === "file:./prisma/dev.db" || dbUrl === "file:dev.db") {
    const dbPath = path.resolve(process.cwd(), "prisma", "dev.db").replace(/\\/g, "/");
    dbUrl = `file:${dbPath}`;
  }
}

const prisma = new PrismaClient({
  datasourceUrl: dbUrl
});

async function main() {
  console.log("=== STARTING CONCURRENCY LOCK TEST ===");

  // 1. Ensure test doctor exists
  let doctor = await prisma.user.findFirst({
    where: { role: "DOCTOR" },
  });

  if (!doctor) {
    console.log("No doctor found. Creating a test doctor...");
    doctor = await prisma.user.create({
      data: {
        name: "Test Concurrency Doctor",
        email: `test-doctor-${Date.now()}@clinic.com`,
        password: "mock_password_hash",
        role: "DOCTOR",
        doctorProfile: {
          create: {
            specialisation: "General Medicine",
            workingHoursStart: "09:00",
            workingHoursEnd: "17:00",
            slotDuration: 30,
            leaveDays: "",
          },
        },
      },
    });
  }

  // 2. Ensure test patient users exist
  const patientsCount = 5;
  const patients = [];
  for (let i = 0; i < patientsCount; i++) {
    const email = `concurrency-patient-${i}-${Date.now()}@test.com`;
    const patient = await prisma.user.create({
      data: {
        name: `Patient ${i}`,
        email,
        password: "mock_password_hash",
        role: "PATIENT",
      },
    });
    patients.push(patient);
  }

  // 3. Define the target time slot
  const testSlotTime = new Date("2026-10-10T10:00:00.000Z");

  // Clean up any existing holds or bookings for this specific slot first
  await prisma.slotHold.deleteMany({
    where: { doctorId: doctor.id, slotTime: testSlotTime },
  });
  await prisma.appointment.deleteMany({
    where: { doctorId: doctor.id, appointmentTime: testSlotTime },
  });

  console.log(`Targeting Slot: Dr. ${doctor.name} at ${testSlotTime.toISOString()}`);
  console.log(`Triggering ${patientsCount} concurrent booking hold attempts...`);

  // 4. Fire parallel hold operations
  const attempts = patients.map(async (patient, index) => {
    try {
      // Simulate the transactional hold logic from our API
      const result = await prisma.$transaction(async (tx) => {
        // Double-check if booked
        const existingAppt = await tx.appointment.findFirst({
          where: { doctorId: doctor!.id, appointmentTime: testSlotTime, status: "BOOKED" },
        });
        if (existingAppt) throw new Error("Slot already booked");

        // Double-check if held
        const existingHold = await tx.slotHold.findFirst({
          where: { doctorId: doctor!.id, slotTime: testSlotTime, expiresAt: { gt: new Date() } },
        });
        if (existingHold) throw new Error("Slot already held");

        // Attempt hold
        const hold = await tx.slotHold.create({
          data: {
            doctorId: doctor!.id,
            slotTime: testSlotTime,
            heldById: patient.id,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min expiry
          },
        });
        return hold;
      });

      return { success: true, patientName: patient.name, data: result };
    } catch (err: any) {
      return { success: false, patientName: patient.name, error: err.message };
    }
  });

  const results = await Promise.all(attempts);

  // 5. Audit Results
  console.log("\n=== TRANSACTION EXECUTION AUDIT ===");
  let successCount = 0;
  let failureCount = 0;

  for (const res of results) {
    if (res.success) {
      successCount++;
      console.log(`✅ [SUCCESS] ${res.patientName} successfully acquired slot lock! Hold ID: ${res.data?.id}`);
    } else {
      failureCount++;
      console.log(`❌ [BLOCKED] ${res.patientName} was blocked: ${res.error}`);
    }
  }

  console.log("\n=== CONCURRENCY Lock SUMMARY ===");
  console.log(`Total Attempts: ${patientsCount}`);
  console.log(`Total Successes: ${successCount}`);
  console.log(`Total Blocked: ${failureCount}`);

  // Clean up test records
  console.log("\nCleaning up test records...");
  await prisma.slotHold.deleteMany({
    where: { doctorId: doctor.id, slotTime: testSlotTime },
  });
  for (const patient of patients) {
    await prisma.user.delete({ where: { id: patient.id } });
  }

  // Assertion check
  if (successCount === 1) {
    console.log("🏆 TEST PASSED: Concurrency locks strictly prevented double-holding. Exactly one transaction succeeded.");
  } else {
    console.error("⚠️ TEST FAILED: Concurrency locking failed or did not resolve correctly.");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("Test execution errored:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
