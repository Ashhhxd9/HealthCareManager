import { NextResponse } from "next/server";
import { getGoogleAuthLoginUrl } from "@/lib/googleAuth";

export async function GET(req: Request) {
  try {
    const oauthUrl = getGoogleAuthLoginUrl();
    return NextResponse.redirect(new URL(oauthUrl, req.url));
  } catch (error) {
    console.error("Google Auth Login Link Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
