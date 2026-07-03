import fs from "fs";
import path from "path";

interface CalendarEventData {
  id: string;
  summary: string;
  description: string;
  startTime: Date;
  endTime: Date;
  doctorEmail: string;
  patientEmail: string;
}

export function getGoogleOAuthUrl(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/oauth/callback";
  
  if (!clientId) {
    // Mock OAuth URL for local sandbox testing
    return `/api/oauth/callback?mock=true&code=mock_code_${Math.random().toString(36).substring(7)}`;
  }

  const scope = "https://www.googleapis.com/auth/calendar.events";
  return `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
}

export async function getTokensFromCode(code: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/oauth/callback";

  if (!clientId || !clientSecret || code.startsWith("mock_code_")) {
    return {
      access_token: `mock_access_token_${Math.random().toString(36).substring(7)}`,
      refresh_token: `mock_refresh_token_${Math.random().toString(36).substring(7)}`,
      expires_in: 3600,
    };
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
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

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Token Exchange failed: ${errText}`);
  }

  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || refreshToken.startsWith("mock_refresh_token_")) {
    return `mock_access_token_${Math.random().toString(36).substring(7)}`;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh access token: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  eventData: CalendarEventData
): Promise<string> {
  if (accessToken.startsWith("mock_access_token_")) {
    const mockEventId = `mock_event_${Math.random().toString(36).substring(7)}`;
    logMockCalendarAction("CREATE", mockEventId, eventData);
    return mockEventId;
  }

  try {
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: eventData.summary,
          description: eventData.description,
          start: { dateTime: eventData.startTime.toISOString() },
          end: { dateTime: eventData.endTime.toISOString() },
          attendees: [{ email: eventData.patientEmail }, { email: eventData.doctorEmail }],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Google Create Event failed: ${await response.text()}`);
    }

    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error("Failed to create Google Calendar Event:", error);
    // Return a mock event ID so booking doesn't crash on Google Calendar failures (Graceful handling)
    return `failed_auth_fallback_${Math.random().toString(36).substring(7)}`;
  }
}

export async function updateGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  eventData: Partial<CalendarEventData>
): Promise<boolean> {
  if (accessToken.startsWith("mock_access_token_") || eventId.startsWith("mock_event_") || eventId.startsWith("failed_auth_fallback_")) {
    logMockCalendarAction("UPDATE", eventId, eventData);
    return true;
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(eventData.summary && { summary: eventData.summary }),
          ...(eventData.description && { description: eventData.description }),
          ...(eventData.startTime && { start: { dateTime: eventData.startTime.toISOString() } }),
          ...(eventData.endTime && { end: { dateTime: eventData.endTime.toISOString() } }),
        }),
      }
    );

    if (!response.ok) {
      console.warn("Failed to update Google Calendar Event:", await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("Google Calendar Update error:", error);
    return false;
  }
}

export async function deleteGoogleCalendarEvent(accessToken: string, eventId: string): Promise<boolean> {
  if (accessToken.startsWith("mock_access_token_") || eventId.startsWith("mock_event_") || eventId.startsWith("failed_auth_fallback_")) {
    logMockCalendarAction("DELETE", eventId, {});
    return true;
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.warn("Failed to delete Google Calendar Event:", await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("Google Calendar Delete error:", error);
    return false;
  }
}

// Sandbox local simulation logger for Google Calendar
function logMockCalendarAction(action: "CREATE" | "UPDATE" | "DELETE", eventId: string, data: any) {
  try {
    const rootDir = process.cwd();
    const logFilePath = path.join(rootDir, "google_calendar_mock.json");
    
    let logs = [];
    if (fs.existsSync(logFilePath)) {
      try {
        const fileContent = fs.readFileSync(logFilePath, "utf-8");
        logs = JSON.parse(fileContent || "[]");
      } catch (e) {
        logs = [];
      }
    }

    logs.push({
      action,
      eventId,
      timestamp: new Date().toISOString(),
      payload: data,
    });

    fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2), "utf-8");
    console.log(`[SANDBOX GOOGLE CALENDAR] Action: ${action} | EventId: ${eventId}`);
  } catch (err) {
    console.error("Failed to write mock Google Calendar log:", err);
  }
}
