import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signToken, hashPassword } from "@/lib/auth";
import { getGoogleUserInfoFromCode } from "@/lib/googleAuth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "Missing authorization code from Google" }, { status: 400 });
    }

    // Retrieve user details from Google
    const profile = await getGoogleUserInfoFromCode(code);

    // Look up user in DB
    let user = await db.user.findUnique({
      where: { email: profile.email },
    });

    // If user doesn't exist, register them as a PATIENT
    if (!user) {
      // Create random secure password
      const randomPassword = Math.random().toString(36).substring(2) + Date.now().toString(36);
      const hashedPassword = await hashPassword(randomPassword);
      
      // Check if there are any admins in the database. If none exist, assign ADMIN role to allow setup.
      const adminCount = await db.user.count({ where: { role: "ADMIN" } });
      const role = adminCount === 0 ? "ADMIN" : "PATIENT";

      user = await db.user.create({
        data: {
          name: profile.name,
          email: profile.email,
          password: hashedPassword,
          role,
        },
      });
      console.log(`[Google Auth] Created new user: ${profile.email} as role ${role}`);
    } else {
      console.log(`[Google Auth] Resolved existing user login: ${profile.email}`);
    }

    // Set JWT Session Cookie
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    
    // Redirect to patient dashboard (or admin if role matches)
    const targetDashboard = user.role === "ADMIN" ? "/admin" : user.role === "DOCTOR" ? "/doctor" : "/patient";
    const redirectUrl = new URL(targetDashboard, req.url);
    
    const response = NextResponse.redirect(redirectUrl);
    response.headers.append(
      "Set-Cookie",
      `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}; Secure=${process.env.NODE_ENV === "production"}`
    );

    return response;
  } catch (error: any) {
    console.error("Google Auth Login Callback Error:", error);
    return NextResponse.json({ error: error.message || "Failed to authenticate via Google" }, { status: 500 });
  }
}
