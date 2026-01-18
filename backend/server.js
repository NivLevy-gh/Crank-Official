import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import OpenAI from "openai";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { generateCandidateSummaryJSON } from "./candidateSummary.js";

const app = express();
app.use(express.json());
app.use(cors());


process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});




// ... rest of server.js ...

// OpenAI + Supabase
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Multer
const upload = multer({ storage: multer.memoryStorage() });

// =============================
// HELPERS
// =============================s
async function getUserFromRequest(req) {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;

  return data.user;
}

function slugifyFileName(name = "resume.pdf") {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

function makeToken() {
  return crypto.randomBytes(16).toString("hex");
}

// =============================
// AUTH ROUTES
// =============================

app.post("/forms", async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  let { name, summary, baseQuestions, aiEnabled, maxAiQuestions, public: isPublic } = req.body;

  aiEnabled = Boolean(aiEnabled);
  maxAiQuestions = Number.isFinite(Number(maxAiQuestions)) ? Number(maxAiQuestions) : 2;

  const share_token = makeToken();
  const publicFlag = Boolean(isPublic);

  const { data, error } = await supabase
    .from("Forms")
    .insert({
      name,
      summary,
      baseQuestions,
      user_id: user.id,
      aiEnabled,
      maxAiQuestions,
      public: publicFlag,
      share_token,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ form: data });
});

app.get("/forms", async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { data, error } = await supabase
    .from("Forms")
    .select("ID, name, summary, baseQuestions, share_token, public, aiEnabled, maxAiQuestions, created_at, archived")
    //                                                                                                      ^^^^^^^^ ADD THIS
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ forms: data || [] });
});

app.get("/forms/:id", async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { id } = req.params;

  const { data, error } = await supabase
    .from("Forms")
    .select("ID, name, summary, baseQuestions, aiEnabled, maxAiQuestions, share_token, public")
    .eq("ID", id)
    .eq("user_id", user.id)
    .single();


  return res.json({ form: data });
});

app.post("/forms/:id/resume", upload.single("resume"), async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Not logged in" });

    const { id: formId } = req.params;

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Resume must be a PDF" });
    }

    const fileName = slugifyFileName(req.file.originalname);
    const path = `${user.id}/${formId}/${Date.now()}_${fileName}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("resumes")
      .upload(path, req.file.buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadErr) return res.status(500).json({ error: uploadErr.message });

    // Dynamic import for pdf-parse
    const parsed = await pdfParse(req.file.buffer);
    const resumeText = (parsed.text || "").slice(0, 12000);

    if (!resumeText.trim()) {
      return res.status(400).json({ error: "Could not read text from PDF" });
    }

    const system = `You extract structured resume info for hiring screening.
Return ONLY valid JSON. No markdown.`;

    const userMsg = `
Extract a compact JSON object from this resume text.

Return JSON with these keys:
{
  "name": string|null,
  "email": string|null,
  "work_experience": [
    {
      "company": string,
      "role": string,
      "duration": string|null,
      "description": string,
      "highlights": string[]
    }
  ],
  "skills": string[],
  "education": [{"school": string|null, "degree": string|null, "major": string|null}],
  "years_experience": number|null,
  "projects": [
    {
      "name": string,
      "description": string,
      "technologies": string[]
    }
  ]
}

Resume text:
${resumeText}
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "";

    let resumeProfile;
    try {
      resumeProfile = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: "Failed to parse resume JSON" });
    }

    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from("resumes")
      .createSignedUrl(path, 60 * 60);

    if (signedErr) return res.status(500).json({ error: signedErr.message });

    return res.json({
      resumeUrl: signed.signedUrl,
      resumePath: path,
      resumeProfile,
    });
  } catch (err) {
    console.error("Resume processing failed:", err);
    return res.status(500).json({ error: "Resume processing failed", detail: err?.message || String(err) });
  }
});

app.post("/forms/:id/ai-next", async (req, res) => {
  const { summary, history, resumeProfile } = req.body;

  try {
    const compact = {
      form_summary: summary || "",
      resume: resumeProfile || {},
      history: (history || []).slice(-12),
    };

    const system = `
You are a sharp, human recruiter doing a real screening call.

Your job: learn something NEW and specific about the candidate each question.

Hard rules:
- Ask EXACTLY ONE question.
- Do NOT restate their answer or say "You did..." / "I see you..." / "I noticed..."
- Do NOT ask generic questions that could apply to anyone.
- The question MUST include a resume-specific noun (company OR project OR tool/tech OR metric).
- Must probe one of: ownership, tradeoffs, decisions, debugging, scope, impact, collaboration.
- No multi-part questions. No "and also".
- 8–18 words.
- Avoid filler like "tell me more", "walk me through", "elaborate" unless absolutely needed.
- Do not repeat topics already covered in history.

If resume is missing or empty:
- Ask for ONE concrete example project with stack + outcome.

Return ONLY the question text. No quotes, no bullets.
`.trim();

    const user = `
Context (JSON):
${JSON.stringify(compact, null, 2)}

Pick an anchor and ask a question.

Step 1 — Pick ONE anchor:
Choose exactly ONE anchor from resume that is NOT already discussed in history:
- specific company + role highlight
- specific project name
- specific technology used in a specific context
- a metric/result if present

Step 2 — Ask ONE question:
Write a natural follow-up that references the anchor explicitly and probes signal.

Good examples of tone (copy this vibe):
- "What was the hardest decision you made on the Stripe billing migration?"
- "Why did you choose Postgres for that project instead of DynamoDB?"
- "What broke in production, and how did you narrow it down?"
- "What did you personally own end-to-end on the React redesign?"
- "What metric moved, and what change actually caused it?"

Now produce ONE question.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.45,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    let nextQuestion = completion.choices?.[0]?.message?.content?.trim() || "";
    nextQuestion = nextQuestion.replace(/^["'`•\-\s]+/, "").replace(/["'`]+$/, "").trim();

    // Simple generic filter
    const genericPatterns = [
      /tell me about yourself/i,
      /strengths|weaknesses/i,
      /why are you interested/i,
      /describe your experience/i,
      /can you elaborate/i,
      /walk me through/i,
      /your background/i,
      /you did/i,
      /i noticed/i,
      /i see/i,
    ];

    const tooGeneric =
      nextQuestion.length < 8 ||
      !nextQuestion.endsWith("?") ||
      genericPatterns.some((re) => re.test(nextQuestion));

    if (!nextQuestion || tooGeneric) {
      return res.json({
        nextQuestion:
          "What tradeoff did you make on your most impactful project, and why?",
      });
    }

    return res.json({ nextQuestion });
  } catch (err) {
    console.error("AI error:", err);
    return res.status(500).json({ error: "AI request failed" });
  }
});



app.post("/forms/:id/responses", async (req, res) => {
  const user = await getUserFromRequest(req);
if (!user) return res.status(401).json({ error: "Not logged in" });

  const { id } = req.params;
  const { answers, resumeProfile } = req.body;

  if (!answers) return res.status(400).json({ error: "Missing answers" });

  const { data: form, error: formErr } = await supabase
    .from("Forms")
    .select("ID, name, summary")
    .eq("ID", id)
    .single();

  if (formErr || !form) return res.status(404).json({ error: "Form not found" });

  let summaryObj = null;
  try {
    summaryObj = await generateCandidateSummaryJSON({
      formName: form.name,
      formSummary: form.summary,
      answers,
      resumeProfile,
    });

    if (typeof summaryObj === "string") summaryObj = JSON.parse(summaryObj);
  } catch (e) {
    console.log("AI summary failed:", e);
    summaryObj = null;
  }

  const { data: saved, error: insErr } = await supabase
    .from("Responses")
    .insert({
      formid: id,
      answers,
      resumeProfile: resumeProfile || null,
      summary: summaryObj,
    })
    .select()
    .single();

  if (insErr) return res.status(500).json({ error: insErr.message });

  return res.json({ response: saved });
});

app.get("/forms/:id/results", async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { id } = req.params;

  const { data: form, error: formErr } = await supabase
    .from("Forms")
    .select("ID, name, summary, user_id")
    .eq("ID", id)
    .single();

  if (formErr || !form) return res.status(404).json({ error: "Form not found" });
  if (form.user_id !== user.id) return res.status(403).json({ error: "Forbidden" });

  const { data: responses, error: rErr } = await supabase
    .from("Responses")
    .select("id, created_at, answers, summary")
    .eq("formid", id)
    .order("created_at", { ascending: false });

  if (rErr) return res.status(500).json({ error: rErr.message });

  return res.json({ form, responses: responses || [] });
});

app.get("/responses/:responseId", async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { responseId } = req.params;

  const { data: resp, error: respErr } = await supabase
    .from("Responses")
    .select("id, formid, created_at, answers, resumeProfile, summary")
    .eq("id", responseId)
    .single();

  if (respErr || !resp) return res.status(404).json({ error: "Response not found" });

  const { data: form, error: formErr } = await supabase
    .from("Forms")
    .select("ID, name, user_id")
    .eq("ID", resp.formid)
    .single();

  if (formErr || !form) return res.status(404).json({ error: "Form not found" });
  if (form.user_id !== user.id) return res.status(403).json({ error: "Forbidden" });

  return res.json({ response: resp, formName: form.name });
});

// =============================
// PUBLIC ROUTES
// =============================

app.get("/public/forms/:shareToken", async (req, res) => {
  const { shareToken } = req.params;

  const { data, error } = await supabase
    .from("Forms")
    .select("ID, name, summary, baseQuestions, aiEnabled, maxAiQuestions, public")
    .eq("share_token", shareToken)
    .single();


  if (!data.public) return res.status(403).json({ error: "Form is not public" });

  return res.json({ form: data });
});


// =============================
// UPDATE FORM (EDIT MODE)
// =============================
// =============================
// UPDATE FORM (EDIT MODE)  ✅ FULL PATCH
// =============================
app.patch("/forms/:id", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Not logged in" });

    const { id } = req.params;

    // note: "public" is a reserved-ish word in JS, so we alias it to isPublic
    const {
      name,
      summary,
      baseQuestions,
      public: isPublic,
      aiEnabled,
      maxAiQuestions,
      archived,
    } = req.body;

    // 1) Make sure the form belongs to this user
    const { data: form, error: findErr } = await supabase
      .from("Forms")
      .select("ID, user_id")
      .eq("ID", id)
      .single();

    if (findErr || !form) return res.status(404).json({ error: "Form not found" });
    if (form.user_id !== user.id) return res.status(403).json({ error: "Forbidden" });

    // 2) Build a safe update payload (ONLY update what you send)
    const update = {};

    if (typeof name === "string") update.name = name;
    if (typeof summary === "string") update.summary = summary;
    if (Array.isArray(baseQuestions)) update.baseQuestions = baseQuestions;

    if (typeof isPublic === "boolean") update.public = isPublic;

    if (typeof aiEnabled === "boolean") update.aiEnabled = aiEnabled;

    if (maxAiQuestions !== undefined) {
      const n = Number(maxAiQuestions);
      if (!Number.isFinite(n) || n < 0 || n > 20) {
        return res.status(400).json({ error: "maxAiQuestions must be a number between 0 and 20" });
      }
      update.maxAiQuestions = n;
    }

    if (typeof archived === "boolean") update.archived = archived;

    // If they didn't send anything valid, don't run a blank update
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    // 3) Persist
    const { data: updated, error: updateErr } = await supabase
      .from("Forms")
      .update(update)
      .eq("ID", id)
      .select(
        "ID, name, summary, baseQuestions, share_token, public, aiEnabled, maxAiQuestions, created_at, archived"
      )
      .single();

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    return res.json({ form: updated });
  } catch (err) {
    console.error("PATCH /forms/:id failed:", err);
    return res.status(500).json({ error: "Failed to update form" });
  }
});


app.post("/public/forms/:shareToken/ai-next", async (req, res) => {
  const { shareToken } = req.params;
  const { summary, history, resumeProfile } = req.body;

  // 1. Validate form + public access
  const { data: form, error } = await supabase
    .from("Forms")
    .select("ID, public")
    .eq("share_token", shareToken)
    .single();

  if (error || !form) {
    return res.status(404).json({ error: "Form not found" });
  }

  if (!form.public) {
    return res.status(403).json({ error: "Form is not public" });
  }

  try {
    // 2. Compact context (prevents prompt bloat)
    const compact = {
      role_summary: summary || "",
      resume: resumeProfile || {},
      history: (history || []).slice(-12),
    };

    // 3. SYSTEM PROMPT (same intelligence as private)
    const system = `
You are a senior recruiter conducting a real screening interview.

Your questions must sound human, specific, and intentional.
Never generic. Never robotic. Never templated.

Hard rules:
- Ask ONE question only.
- It must be grounded in ONE concrete resume detail.
- Do NOT repeat topics already covered in history.
- Avoid phrases like "you mentioned", "tell me about", "walk me through" more than once.
- No fluff, no buzzwords, no corporate language.

Style:
- 1–2 sentences max.
- Conversational.
- Curious, not interrogative.
- Should take 60–120 seconds to answer well.
`.trim();

    // 4. USER PROMPT (forces grounding + anti-generic behavior)
    const user = `
INTERNAL PROCESS (do not reveal):

STEP A — Choose ONE anchor NOT discussed yet:
- a specific role + company
- a specific project
- a tool used in context
- a measurable outcome

STEP B — Ask a question that:
- explicitly references the anchor
- probes decision-making, tradeoffs, or impact
- could NOT be asked to a different candidate

INVALID if:
- it could apply to anyone
- it lacks a resume-specific noun
- it sounds like HR filler

Return ONLY the question text. No formatting.

INPUT:
${JSON.stringify(compact, null, 2)}
`.trim();

    // 5. Call OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.55,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    let nextQuestion =
      completion.choices?.[0]?.message?.content?.trim() || "";

    // 6. Clean up formatting
    nextQuestion = nextQuestion
      .replace(/^["'`•\-\s]+/, "")
      .replace(/["'`]+$/, "")
      .trim();

    // 7. Final safety guard (anti-generic)
    const tooGeneric =
      nextQuestion.length < 10 ||
      !/[?]$/.test(nextQuestion) ||
      /(your background|strengths|weaknesses|tell me about yourself|resume|experience)/i.test(
        nextQuestion
      );

    if (!nextQuestion || tooGeneric) {
      return res.json({
        nextQuestion:
          "On your most recent project, what decision did you make that had the biggest downstream impact?",
      });
    }

    // 8. Success
    return res.json({ nextQuestion });
  } catch (err) {
    console.error("Public AI error:", err);
    return res.status(500).json({ error: "AI request failed" });
  }
});

app.post("/public/forms/:shareToken/responses", async (req, res) => {
  const { shareToken } = req.params;
  const { answers, resumeProfile } = req.body;

  const { data: form, error } = await supabase
    .from("Forms")
    .select("ID, name, summary, public")
    .eq("share_token", shareToken)
    .single();

  if (error || !form) return res.status(404).json({ error: "Form not found" });
  if (!form.public) return res.status(403).json({ error: "Form is not public" });

  let summaryObj = null;
  try {
    summaryObj = await generateCandidateSummaryJSON({
      formName: form.name,
      formSummary: form.summary,
      answers,
      resumeProfile,
    });
    if (typeof summaryObj === "string") summaryObj = JSON.parse(summaryObj);
  } catch (e) {
    console.log("AI summary failed (public):", e);
    summaryObj = null;
  }

  const { data: saved, error: insErr } = await supabase
    .from("Responses")
    .insert({
      formid: form.ID,
      answers,
      resumeProfile: resumeProfile || null,
      summary: summaryObj,
    })
    .select()
    .single();

  if (insErr) return res.status(500).json({ error: insErr.message });

  return res.json({ response: saved });
});

app.post("/responses/:responseId/summarize", async (req, res) => {
  try {
    const { responseId } = req.params;

    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Not logged in" });

    const { data: resp, error: respErr } = await supabase
      .from("Responses")
      .select("id, formid, answers, resumeProfile")
      .eq("id", responseId)
      .single();

    if (respErr || !resp) return res.status(404).json({ error: "Response not found" });

    const { data: form, error: formErr } = await supabase
      .from("Forms")
      .select("name, summary")
      .eq("ID", resp.formid)
      .single();

    const system = `
You summarize job candidates for a recruiter.
Return STRICT JSON only with this schema:
{
  "candidate_name": string,
  "one_liner": string,
  "strengths": string[],
  "risks": string[],
  "recommended_next_step": string
}
No scoring. Keep it concise. No extra keys.
`.trim();

    const answers = resp.answers || [];
    const resumeProfile = resp.resumeProfile || null;

    const nameGuess =
      answers.find((qa) => (qa?.question || "").toLowerCase().includes("name"))
        ?.answer?.trim() || "Candidate";

    const userPrompt = `
Form: ${form?.name || ""}
Role context: ${form?.summary || ""}

Candidate name: ${nameGuess}

Resume profile (parsed):
${JSON.stringify(resumeProfile, null, 2)}

Answers:
${JSON.stringify(answers, null, 2)}
`.trim();

let summaryObj = await generateCandidateSummaryJSON({
  formName: form?.name,
  formSummary: form?.summary,
  answers: resp.answers,
  resumeProfile: resp.resumeProfile,
});

    if (typeof summaryObj === "string") summaryObj = JSON.parse(summaryObj);

    const { error: saveErr } = await supabase
      .from("Responses")
      .update({ summary: summaryObj })
      .eq("id", responseId);

    if (saveErr) return res.status(500).json({ error: saveErr.message });

    return res.json({ summary: summaryObj });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ error: "Failed to summarize" });
  }
});

// =============================
// START SERVER
// =============================
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});