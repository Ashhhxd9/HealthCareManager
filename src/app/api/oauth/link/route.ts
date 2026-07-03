import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getGoogleOAuthUrl } from "@/lib/googleCalendar";

export async function GET(req: Request) {
  try {
    const session = await getUserFromRequest(req);
    if (!session || session.role !== "DOCTOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const oauthUrl = getGoogleOAuthUrl();
    return NextResponse.redirect(new URL(oauthUrl, req.url));
  } catch (error) {
    console.error("OAuth Link Generation Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
