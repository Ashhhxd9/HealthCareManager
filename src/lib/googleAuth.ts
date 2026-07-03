interface GoogleUserProfile {
  email: string;
  name: string;
  sub: string; // Google unique identifier
}

export function getGoogleAuthLoginUrl(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_LOGIN_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";

  if (!clientId) {
    // Sandbox Mock Login Flow
    return `/api/auth/google/callback?mock=true&code=mock_identity_code_${Math.random().toString(36).substring(7)}`;
  }

  const scope = "openid email profile";
  return `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${encodeURIComponent(scope)}&prompt=consent`;
}

export async function getGoogleUserInfoFromCode(code: string): Promise<GoogleUserProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_LOGIN_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";

  if (!clientId || !clientSecret || code.startsWith("mock_identity_code_")) {
    // Sandbox Mock Identity Profile Resolver
    return {
      email: "google-mock-user@gmail.com",
      name: "Bob Mock Google Patient",
      sub: "mock_google_sub_123456789",
    };
  }

  // 1. Exchange auth code for tokens
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Google OAuth token exchange failed: ${errText}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  // 2. Fetch User Profile Info from Google
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!profileResponse.ok) {
    const errText = await profileResponse.text();
    throw new Error(`Failed to retrieve Google User Info: ${errText}`);
  }

  return profileResponse.json();
}
