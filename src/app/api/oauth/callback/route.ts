import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTokensFromCode } from "@/lib/googleCalendar";

export async function GET(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "DOCTOR") {
      // If session cookie is not accessible (e.g. cross-site redirect block or cookie not sent), 
      // we can try to find the last updated doctor or prompt them to log in.
      // But in local sandbox environment, they are logged in.
      return NextResponse.json({ error: "Doctor session not found. Please log in before linking calendar." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    
    if (!code) {
      return NextResponse.json({ error: "Missing authorization code from Google" }, { status: 400 });
    }

    // Exchange authorization code for token keys
    const tokens = await getTokensFromCode(code);

    // Save tokens inside Doctor Profile
    await db.doctorProfile.update({
      where: { userId: session.id },
      data: {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token || undefined, // Refresh token might only be sent on first authorization request
      },
    });

    // Redirect doctor back to their home portal with success flag
    return NextResponse.redirect(new URL("/doctor?calendar_sync=success", req.url));
  } catch (error: any) {
    console.error("Google OAuth Callback Error:", error);
    return NextResponse.json({ error: error.message || "Failed to link Google Calendar" }, { status: 500 });
  }
}
