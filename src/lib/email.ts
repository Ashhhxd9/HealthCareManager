import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  icsAttachment?: {
    filename: string;
    content: string;
  };
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const host = process.env.EMAIL_SERVER_HOST;
  const port = parseInt(process.env.EMAIL_SERVER_PORT || "587");
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  const from = process.env.EMAIL_FROM || "no-reply@clinicmanager.com";

  const hasCredentials = host && user && pass;

  if (hasCredentials) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      const mailOptions: any = {
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      };

      if (options.icsAttachment) {
        mailOptions.attachments = [
          {
            filename: options.icsAttachment.filename,
            content: options.icsAttachment.content,
            contentType: "text/calendar",
          },
        ];
      }

      await transporter.sendMail(mailOptions);
      console.log(`Email successfully sent via SMTP to: ${options.to}`);
      return true;
    } catch (error) {
      console.error("Failed to send email via SMTP:", error);
      // Fall through to mock file logger if SMTP fails
    }
  }

  // Fallback / Sandbox mode: Log email details to file for local testing
  try {
    const rootDir = process.cwd();
    const logFilePath = path.join(rootDir, "emails_sent.json");
    
    let emails = [];
    if (fs.existsSync(logFilePath)) {
      try {
        const fileContent = fs.readFileSync(logFilePath, "utf-8");
        emails = JSON.parse(fileContent || "[]");
      } catch (e) {
        emails = [];
      }
    }

    const newEmailLog = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
      to: options.to,
      subject: options.subject,
      bodyPreview: options.html.replace(/<[^>]*>/g, " ").slice(0, 150) + "...",
      html: options.html,
      hasCalendarAttachment: !!options.icsAttachment,
      calendarEvent: options.icsAttachment ? options.icsAttachment.content : null,
    };

    emails.push(newEmailLog);
    fs.writeFileSync(logFilePath, JSON.stringify(emails, null, 2), "utf-8");
    console.log(`[SANDBOX MAIL LOGGED] To: ${options.to} | Subject: ${options.subject}`);
    return true;
  } catch (logError) {
    console.error("Failed to write mock email log:", logError);
    return false;
  }
}

// Generates standard .ics calendar invite content
export function generateIcsContent(event: {
  id: string;
  summary: string;
  description: string;
  startTime: Date;
  endTime: Date;
  doctorName: string;
  patientName: string;
}): string {
  const formatDate = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  const createdTime = formatDate(new Date());
  const startStr = formatDate(new Date(event.startTime));
  const endStr = formatDate(new Date(event.endTime));

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Healthcare Clinic//Appointment Manager//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${event.id}
DTSTAMP:${createdTime}
CREATED:${createdTime}
LAST-MODIFIED:${createdTime}
DTSTART:${startStr}
DTEND:${endStr}
SUMMARY:${event.summary}
DESCRIPTION:${event.description.replace(/\n/g, "\\n")}
ORGANIZER;CN="Healthcare Clinic":MAILTO:no-reply@clinicmanager.com
ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:MAILTO:${event.patientName}
SEQUENCE:0
STATUS:CONFIRMED
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;
}
