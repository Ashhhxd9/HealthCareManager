export interface PreVisitSummary {
  urgency: "Low" | "Medium" | "High";
  chiefComplaint: string;
  suggestedQuestions: string[];
}

export interface PostVisitSummary {
  summary: string;
  medicationSchedule: string;
  followUpSteps: string;
}

export async function generatePreVisitSummary(symptoms: string): Promise<PreVisitSummary> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "mock" || apiKey === "") {
    return getMockPreVisitSummary(symptoms);
  }

  try {
    const prompt = `Analyse these symptoms and return a JSON object containing exactly the following keys:
- "urgency": "Low" | "Medium" | "High"
- "chiefComplaint": a short summary of the main issue
- "suggestedQuestions": an array of exactly three suggested questions for the doctor

Symptoms: ${symptoms}

Return ONLY raw JSON, do not wrap in markdown code blocks.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from Gemini API");

    const result = JSON.parse(text.trim());
    return {
      urgency: ["Low", "Medium", "High"].includes(result.urgency) ? result.urgency : "Medium",
      chiefComplaint: result.chiefComplaint || "Symptom analysis completed",
      suggestedQuestions: Array.isArray(result.suggestedQuestions)
        ? result.suggestedQuestions.slice(0, 3)
        : ["What triggers these symptoms?", "How long have you had this?", "Are you taking any medication?"],
    };
  } catch (error) {
    console.error("Gemini API error (falling back to mock summary):", error);
    return getMockPreVisitSummary(symptoms);
  }
}

export async function generatePostVisitSummary(notes: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "mock" || apiKey === "") {
    return getMockPostVisitSummary(notes);
  }

  try {
    const prompt = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps. Ensure it is written in a reassuring, clear, and easy-to-understand language.

Clinical Notes: ${notes}

Response format:
Write it as a structured markdown output.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from Gemini API");

    return text.trim();
  } catch (error) {
    console.error("Gemini API error (falling back to mock summary):", error);
    return getMockPostVisitSummary(notes);
  }
}

// High-fidelity fallback heuristic generator for pre-visit symptoms
function getMockPreVisitSummary(symptoms: string): PreVisitSummary {
  const lowerSymptoms = symptoms.toLowerCase();
  
  let urgency: "Low" | "Medium" | "High" = "Low";
  let questions = [
    "How often do these symptoms occur during the day?",
    "Does anything specific make the symptoms better or worse?",
    "Are you experiencing any other minor symptoms like nausea or fatigue?"
  ];

  if (
    lowerSymptoms.includes("chest") ||
    lowerSymptoms.includes("breath") ||
    lowerSymptoms.includes("heart") ||
    lowerSymptoms.includes("severe pain") ||
    lowerSymptoms.includes("faint") ||
    lowerSymptoms.includes("unconscious") ||
    lowerSymptoms.includes("bleed")
  ) {
    urgency = "High";
    questions = [
      "When exactly did this acute episode begin, and has it worsened?",
      "Are you experiencing any radiating pain to your arm, neck, or back?",
      "Do you have a personal or family history of cardiac or respiratory conditions?"
    ];
  } else if (
    lowerSymptoms.includes("fever") ||
    lowerSymptoms.includes("cough") ||
    lowerSymptoms.includes("vomiting") ||
    lowerSymptoms.includes("diarrhea") ||
    lowerSymptoms.includes("rash") ||
    lowerSymptoms.includes("allergy") ||
    lowerSymptoms.includes("infection")
  ) {
    urgency = "Medium";
    questions = [
      "What is the highest temperature you have recorded, if any?",
      "Have you noticed any swelling, skin irritation, or localized warmth?",
      "Are you currently taking any over-the-counter fever reducers or pain relievers?"
    ];
  }

  const snippet = symptoms.length > 60 ? symptoms.slice(0, 60) + "..." : symptoms;
  const chiefComplaint = `Patient presents with: "${snippet}"`;

  return {
    urgency,
    chiefComplaint,
    suggestedQuestions: questions,
  };
}

// Fallback logic for post-visit summary
function getMockPostVisitSummary(notes: string): string {
  // Simple heuristic parser
  const lines = notes.split(/[\n;]/).map(l => l.trim()).filter(Boolean);
  
  let medications: string[] = [];
  let followUp: string[] = [];
  let generalInfo: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("mg") || lower.includes("tablet") || lower.includes("capsule") || lower.includes("take") || lower.includes("dose") || lower.includes("prescription") || lower.includes("rx")) {
      medications.push(line);
    } else if (lower.includes("follow up") || lower.includes("return") || lower.includes("next week") || lower.includes("days") || lower.includes("see you")) {
      followUp.push(line);
    } else {
      generalInfo.push(line);
    }
  }

  if (medications.length === 0) {
    medications.push("No prescription details entered. Contact the clinic if you need clarification.");
  }
  if (followUp.length === 0) {
    followUp.push("Follow up as needed or if symptoms persist.");
  }

  return `### Patient Post-Visit Summary & Care Plan (LLM Mock Mode)

#### 📝 Summary of Visit
${generalInfo.map(g => `- ${g}`).join("\n") || "- The doctor reviewed your recovery status and updated your treatment plan."}

#### 💊 Medication Schedule
${medications.map(m => `- **${m}**`).join("\n")}

#### 📅 Follow-up Steps & Instructions
${followUp.map(f => `- ${f}`).join("\n")}

---
*Note: This summary was generated automatically in Sandbox fallback mode.*`;
}
