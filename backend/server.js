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
// =============================
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
  const { id } = req.params;
  const { summary, history, resumeProfile } = req.body;

  try {
    const compact = {
      role_summary: summary || "",
      resume: resumeProfile || {},
      history: (history || []).slice(-12), // keep recent context, avoid huge prompts
    };

    const system = `
You are a senior recruiter running a real phone screen.
Your questions must sound human and specific — never generic, never "AI generated".

Hard rules:
- Ask ONE question only.
- It must be grounded in ONE concrete resume/detail (company, role, project, tech, metric, highlight).
- Never repeat an area already covered in history.
- Avoid canned phrases like "walk me through" / "tell me about" more than once.
- No fluff, no buzzwords, no "alignment" language.

Style:
- 1–2 sentences max.
- Conversational, natural.
- Not overly formal.
- Should take 60–120 seconds to answer well (not yes/no).
`.trim();

    const user = `
You must do this in two steps internally:

STEP A — Choose one "anchor":
Pick exactly ONE anchor from the resume that is NOT already discussed in history.
An anchor is one of:
- a specific work_experience highlight
- a specific project
- a specific tool/skill used in a specific context
- a metric/outcome (if present)

STEP B — Ask a strong question:
Write a question that:
- references the anchor explicitly
- probes decision-making, tradeoffs, scope, or impact
- feels like a real interviewer wrote it

Anti-generic checks:
- If the question could apply to any candidate, it's invalid.
- If the question doesn't mention a resume-specific noun (project/company/tool), it's invalid.

Return ONLY the question text. No quotes. No bullet. No extra formatting.

INPUT:
${JSON.stringify(compact, null, 2)}
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.55, // lower than 0.7 = less "random template" weirdness
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    let nextQuestion = completion.choices?.[0]?.message?.content?.trim() || "";
    nextQuestion = nextQuestion.replace(/^["'`•\-\s]+/, "").replace(/["'`]+$/, "").trim();

    // Final guard: reject generic questions (quick heuristic)
    const tooGeneric =
      nextQuestion.length < 8 ||
      !/[A-Za-z]/.test(nextQuestion) ||
      !/[?]$/.test(nextQuestion) ||
      /(candidate|your resume|your background|tell me about yourself|strengths|weaknesses)/i.test(nextQuestion);

    if (!nextQuestion || tooGeneric) {
      return res.json({
        nextQuestion:
          "On your most recent project, what tradeoff did you make that you still think about?",
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

  const { data: form, error } = await supabase
    .from("Forms")
    .select("ID, public")
    .eq("share_token", shareToken)
    .single();

  if (error || !form) return res.status(404).json({ error: "Form not found" });
  if (!form.public) return res.status(403).json({ error: "Form is not public" });

  try {
    const prompt = `
You are an AI SCREENING INTERVIEWER.

ROLE CONTEXT:
${summary || ""}

Resume JSON:
${JSON.stringify(resumeProfile || {})}

Conversation so far:
${JSON.stringify(history || [])}

Ask ONE deep follow-up question.
Return ONLY the question text.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const nextQuestion = completion.choices?.[0]?.message?.content?.trim() || "";
    return res.json({ nextQuestion });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "AI failed" });
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