# Healthcare Appointment & Follow-up Manager

A full-stack medical clinic appointment scheduling platform with separate dashboards for Patients, Doctors, and Administrators. Features AI symptom summaries, AI post-visit care plans, slot lock concurrency control, Google Calendar syncing, and medication reminders.

---

## 🚀 Setup & Local Execution Guide

### 1. Prerequisites
- **Node.js**: Version 18 or higher.
- **npm** or another package manager.

### 2. Installation
Navigate to the root directory and install dependencies:
```bash
npm install
```

### 3. Database Migration
For local SQLite fallback, run migrations to generate the local database file:
```bash
npx prisma migrate dev --name init
```

For **Supabase (PostgreSQL)**, once you configure your connection string in `.env` (see step 4), push the schema directly to your Supabase project:
```bash
npx prisma db push
```

### 4. Configuration
Create a `.env` file in the root directory. You can copy the template below:
```ini
# For SQLite (default local fallback):
DATABASE_URL="file:./dev.db"
# For Supabase (PostgreSQL), uncomment below and plug details:
# DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres?schema=public"

JWT_SECRET="clinic_manager_super_secret_key"

# Gemini API Integration (Leave as 'mock' for sandbox fallback mode)
GEMINI_API_KEY="mock"

# Google OAuth Configuration (Calendar OAuth & Google Login)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="http://localhost:3000/api/oauth/callback"
GOOGLE_LOGIN_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"

# Email Integration (Leave blank to output emails to local emails_sent.json)
EMAIL_SERVER_HOST=""
EMAIL_SERVER_PORT="587"
EMAIL_SERVER_USER=""
EMAIL_SERVER_PASSWORD=""
EMAIL_FROM="no-reply@clinicmanager.com"
```

### 5. Running the Application
Start the Next.js local development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Sandbox Fallback Testing Mode (Zero-Setup Verification)
If you do not have active API credentials, the system runs in a **high-fidelity sandbox fallback mode**:
1. **Emails**: Sent emails are appended to `emails_sent.json` in the root folder, showing HTML templates and `.ics` files.
2. **Google Calendar**: Synced calendar actions are logged to `google_calendar_mock.json` in the root folder.
3. **AI Symptom Summaries**: Keyword-based algorithms mimic Gemini's categorization, urgency flags (Low/Med/High), and clinical questions based on input symptoms.

---

## 📋 Database Schema & Models
The SQLite database consists of:
- **User**: Name, email, hashed password, and role (`PATIENT`, `DOCTOR`, `ADMIN`).
- **DoctorProfile**: Specialisation, working hours (Start/End), slot duration, leave days list, and Google Calendar tokens.
- **Appointment**: Symptoms text, LLM urgency, chief complaint, doctor questions list, clinical logs, post-visit summary markdown, and calendar event ID.
- **SlotHold**: Doctor ID, slot time, patient ID, and expiry timestamp (5-minute TTL unique constraint lock).
- **Notification**: Target email, subject, body text, retry count, and status logs.
- **MedicationReminder**: Patient ID, drug details, times of day, and active toggle state.

---

## 🧠 LLM Prompts Design

### 1. Pre-visit Symptom Analysis Prompt
- **Context**: Executed during appointment booking.
- **Prompt**:
  ```text
  Analyse these symptoms and return a JSON object containing exactly the following keys:
  - "urgency": "Low" | "Medium" | "High"
  - "chiefComplaint": a short summary of the main issue
  - "suggestedQuestions": an array of exactly three suggested questions for the doctor

  Symptoms: <symptoms>
  ```

### 2. Post-visit Care Plan Summary Prompt
- **Context**: Executed when a doctor submits consultation notes.
- **Prompt**:
  ```text
  Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps. Ensure it is written in a reassuring, clear, and easy-to-understand language.

  Clinical Notes: <notes>
  ```

---

## 🔗 Google Calendar API Integration Setup Steps
To configure real Google Calendar sync:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a Project and enable the **Google Calendar API**.
3. Configure the **OAuth Consent Screen**:
   - Set publishing status to **Testing** and add your tester Gmail account.
   - Add scopes: `.../auth/calendar.events` (read/write access to calendar events).
4. Go to **Credentials**:
   - Create **OAuth 2.0 Client ID** choosing "Web Application".
   - Add Authorized Redirect URI: `http://localhost:3000/api/oauth/callback`.
5. Copy the Client ID and Secret to your `.env` file.
6. Log in as a Doctor, and click "Connect Google Calendar" to authorize syncing.

---

## ⚙️ Background Jobs Runner
To execute automated cron tasks (reminders, failed email retries, expired locks cleanup):
*   Trigger the jobs endpoint: `GET /api/jobs/run`
*   *Verification Tip*: You can access [http://localhost:3000/api/jobs/run?test=true](http://localhost:3000/api/jobs/run?test=true) in your browser to force-trigger all active medication reminders and watch `emails_sent.json` update in real-time.
