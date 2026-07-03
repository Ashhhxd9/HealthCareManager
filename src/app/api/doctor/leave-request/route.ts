import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "DOCTOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { leaveDate, reason } = await req.json();

    if (!leaveDate || !/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) {
      return NextResponse.json({ error: "Invalid date format. Expected YYYY-MM-DD" }, { status: 400 });
    }

    // Check if there is already a pending or approved request on this date for this doctor
    const existingRequest = await db.leaveRequest.findFirst({
      where: {
        doctorId: session.id,
        leaveDate,
        status: { in: ["PENDING", "APPROVED"] },
      },
    });

    if (existingRequest) {
      return NextResponse.json({ error: "You already have a pending or approved leave request for this date." }, { status: 400 });
    }

    const request = await db.leaveRequest.create({
      data: {
        doctorId: session.id,
        leaveDate,
        reason: reason || null,
        status: "PENDING",
      },
    });

    return NextResponse.json({ success: true, request });
  } catch (error: any) {
    console.error("Create leave request error:", error);
    return NextResponse.json({ error: error.message || "Failed to submit request" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role === "ADMIN") {
      const requests = await db.leaveRequest.findMany({
        include: { doctor: true },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(requests);
    } else if (session.role === "DOCTOR") {
      const requests = await db.leaveRequest.findMany({
        where: { doctorId: session.id },
        orderBy: { leaveDate: "asc" },
      });
      return NextResponse.json(requests);
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch (error: any) {
    console.error("Fetch leave requests error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch requests" }, { status: 500 });
  }
}
