// server.js
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
app.use(express.json({ limit: "2mb" }));
app.use(cors());

// --------------------
// Safety logging
// --------------------
process.on("unhandledRejection", (err) => console.error("UNHANDLED REJECTION:", err));
process.on("uncaughtException", (err) => console.error("UNCAUGHT EXCEPTION:", err));

// --------------------
// Clients
// --------------------
if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ Missing OPENAI_API_KEY in env. AI routes will fail.");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --------------------
// Multer
// --------------------
const upload = multer({ storage: multer.memoryStorage() });

// --------------------
// Helpers
// --------------------
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

function asBool(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(x)));
}

// NOTE: tiny heuristic — filters obviously generic/robotic output
function isTooGeneric(q) {
  const s = (q || "").trim();
  if (s.length < 12) return true;
  if (!s.endsWith("?")) return true;

  // “AI-ish”/HR-ish language
  if (/(alignment|passion|culture fit|weaknesses|strengths|why should we hire|tell me about yourself)/i.test(s)) return true;
  // Generic lead-ins
  if (/^(you did|i see|based on|it seems|from your resume)/i.test(s)) return true;

  return false;
}

function safeJsonParse(v) {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

// Extract “things already discussed” from history so we don’t repeat areas.
// This doesn’t have to be perfect — it helps.
function buildCoveredTopics(history = []) {
  const text = history
    .map((qa) => `${qa?.question || ""} ${qa?.answer || ""}`.toLowerCase())
    .join(" ");

  const tokens = new Set();
  // pull words that look like tech/company/project tokens
  for (const m of text.matchAll(/[a-z0-9][a-z0-9\+\.\-_]{2,}/g)) {
    const w = m[0];
    if (["the", "and", "for", "with", "you", "your", "this", "that", "from"].includes(w)) continue;
    tokens.add(w);
  }
  return Array.from(tokens).slice(0, 120);
}

// --------------------
// AI: “real interviewer” follow-up generator
// Shared by private + public routes
// --------------------
async function generateFollowupQuestion({
  mode, // "owner" | "public"
  roleSummary,
  baseQuestions,
  history,
  resumeProfile,
}) {
  // Require resume if you want hard enforcement:
  // (Frontend can still gate, but backend enforcement prevents bypass.)
  if (!resumeProfile || Object.keys(resumeProfile || {}).length === 0) {
    return {
      ok: false,
      error: "Resume required",
      status: 400,
    };
  }

  const covered = buildCoveredTopics(history || []);

  // Keep prompt compact & deterministic
  const compact = {
    mode,
    role_summary: (roleSummary || "").slice(0, 1200),
    base_questions: (baseQuestions || []).slice(0, 12),
    history: (history || []).slice(-12),
    resume: resumeProfile || {},
    covered_tokens: covered,
  };

  const system = `
You are a senior hiring manager conducting a fast, high-signal screen.
Your output must feel like a real human wrote it.

You NEVER ask generic questions.
You ALWAYS anchor to a resume-specific detail (company / project / metric / tool used in context).

Rules (hard):
- Output EXACTLY one question (no preface, no quotes, no bullets).
- 1–2 sentences max.
- Must reference at least ONE specific noun from resumeProfile:
  company, project name, technology used, metric, feature, domain, or achievement.
- Must probe decision-making: tradeoffs, scope, constraints, debugging, ownership, impact.
- No repeating topics already covered (use covered_tokens + history).
- Avoid robotic phrasing like: "You did X...", "I see...", "Based on your resume..."
- Avoid canned prompts: "walk me through" / "tell me about" (use at most once TOTAL; prefer alternatives).

Quality checks (hard):
- If your question could apply to ANY candidate, it is invalid.
- If your question doesn’t mention something resume-specific, it is invalid.

You may be creative, but never silly: be sharp, concrete, and useful.
`.trim();

  // Two-step internal plan request but returns ONLY final question text
  const user = `
Use this process internally:

Step 1 (ANCHOR): Pick ONE anchor not covered yet.
Anchors must be taken from resumeProfile.work_experience[].highlights OR resumeProfile.projects[] OR a specific skill used in context.

Step 2 (ARCHETYPE): Choose ONE archetype:
- Decision+Tradeoff
- Ownership+Scope
- DepthCheck(tool-in-context)
- Reflection/Regret (rare)

Step 3 (QUESTION): Write the best possible question using the chosen anchor + archetype.

Output ONLY the final question sentence(s).

INPUT:
${JSON.stringify(compact)}
`.trim();

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.55,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  let q = completion.choices?.[0]?.message?.content?.trim() || "";
  q = q.replace(/^["'`•\-\s]+/, "").replace(/["'`]+$/, "").trim();

  // Guardrail fallback (still anchored-ish but generic-safe)
  if (!q || isTooGeneric(q)) {
    // Use a slightly “smart” fallback seeded by resume
    const company =
      resumeProfile?.work_experience?.[0]?.company ||
      resumeProfile?.projects?.[0]?.name ||
      "your most recent work";
    q = `On ${company}, what tradeoff did you make that you’d handle differently if the constraints changed (timeline, scale, or reliability)?`;
  }

  return { ok: true, question: q };
}

// =============================
// OWNER / AUTH ROUTES
// =============================

// CREATE FORM
app.post("/forms", async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  let {
    name,
    summary,
    baseQuestions,
    aiEnabled,
    maxAiQuestions,
    public: isPublic,
  } = req.body;

  aiEnabled = asBool(aiEnabled);
  maxAiQuestions = clampInt(maxAiQuestions, 0, 20, 2);
  const share_token = makeToken();
  const publicFlag = asBool(isPublic);

  const { data, error } = await supabase
    .from("Forms")
    .insert({
      name,
      summary,
      baseQuestions: Array.isArray(baseQuestions) ? baseQuestions : [],
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

// LIST FORMS
app.get("/forms", async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { data, error } = await supabase
    .from("Forms")
    .select("ID, name, summary, baseQuestions, share_token, public, aiEnabled, maxAiQuestions, created_at, archived")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ forms: data || [] });
});

// GET ONE FORM
app.get("/forms/:id", async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { id } = req.params;

  const { data, error } = await supabase
    .from("Forms")
    .select("ID, name, summary, baseQuestions, aiEnabled, maxAiQuestions, share_token, public, archived")
    .eq("ID", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Form not found" });
  return res.json({ form: data });
});

// UPLOAD + PARSE RESUME (OWNER MODE)
// Note: This returns resumeProfile you pass into ai-next + responses.
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

Be strict: if unknown, use null/[].
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
    const resumeProfile = safeJsonParse(raw);
    if (!resumeProfile) {
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
    return res.status(500).json({
      error: "Resume processing failed",
      detail: err?.message || String(err),
    });
  }
});

// AI NEXT (OWNER / PRIVATE)
app.post("/forms/:id/ai-next", async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { id } = req.params;
  const { summary, baseQuestions, history, resumeProfile } = req.body;

  // Ensure form belongs to owner (prevents probing others)
  const { data: form, error } = await supabase
    .from("Forms")
    .select("ID, user_id, aiEnabled, maxAiQuestions, summary, baseQuestions")
    .eq("ID", id)
    .single();

  if (error || !form) return res.status(404).json({ error: "Form not found" });
  if (form.user_id !== user.id) return res.status(403).json({ error: "Forbidden" });

  if (form.aiEnabled === false) {
    return res.status(400).json({ error: "AI follow-ups disabled for this form." });
  }

  try {
    const out = await generateFollowupQuestion({
      mode: "owner",
      roleSummary: summary ?? form.summary,
      baseQuestions: baseQuestions ?? form.baseQuestions,
      history,
      resumeProfile,
    });

    if (!out.ok) return res.status(out.status || 500).json({ error: out.error || "AI failed" });
    return res.json({ nextQuestion: out.question });
  } catch (err) {
    console.error("AI error (owner):", err);
    return res.status(500).json({ error: "AI request failed" });
  }
});

// SUBMIT RESPONSES (OWNER)
app.post("/forms/:id/responses", async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { id } = req.params;
  const { answers, resumeProfile } = req.body;

  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: "Missing answers" });
  }
  if (!resumeProfile) {
    return res.status(400).json({ error: "Resume required" });
  }

  const { data: form, error: formErr } = await supabase
    .from("Forms")
    .select("ID, name, summary, user_id")
    .eq("ID", id)
    .single();

  if (formErr || !form) return res.status(404).json({ error: "Form not found" });
  if (form.user_id !== user.id) return res.status(403).json({ error: "Forbidden" });

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

// RESULTS (OWNER)
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

// RESPONSE DETAIL (OWNER)
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

// UPDATE FORM (OWNER PATCH)
app.patch("/forms/:id", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Not logged in" });

    const { id } = req.params;

    const {
      name,
      summary,
      baseQuestions,
      public: isPublic,
      aiEnabled,
      maxAiQuestions,
      archived,
    } = req.body;

    const { data: form, error: findErr } = await supabase
      .from("Forms")
      .select("ID, user_id")
      .eq("ID", id)
      .single();

    if (findErr || !form) return res.status(404).json({ error: "Form not found" });
    if (form.user_id !== user.id) return res.status(403).json({ error: "Forbidden" });

    const update = {};
    if (typeof name === "string") update.name = name;
    if (typeof summary === "string") update.summary = summary;
    if (Array.isArray(baseQuestions)) update.baseQuestions = baseQuestions;
    if (typeof isPublic === "boolean") update.public = isPublic;
    if (typeof aiEnabled === "boolean") update.aiEnabled = aiEnabled;

    if (maxAiQuestions !== undefined) {
      update.maxAiQuestions = clampInt(maxAiQuestions, 0, 20, 2);
    }

    if (typeof archived === "boolean") update.archived = archived;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("Forms")
      .update(update)
      .eq("ID", id)
      .select("ID, name, summary, baseQuestions, share_token, public, aiEnabled, maxAiQuestions, created_at, archived")
      .single();

    if (updateErr) return res.status(500).json({ error: updateErr.message });
    return res.json({ form: updated });
  } catch (err) {
    console.error("PATCH /forms/:id failed:", err);
    return res.status(500).json({ error: "Failed to update form" });
  }
});

// =============================
// PUBLIC ROUTES
// =============================

// GET PUBLIC FORM (NO AUTH)
app.get("/public/forms/:shareToken", async (req, res) => {
  const { shareToken } = req.params;

  const { data, error } = await supabase
    .from("Forms")
    .select("ID, name, summary, baseQuestions, aiEnabled, maxAiQuestions, public")
    .eq("share_token", shareToken)
    .single();

  if (error || !data) return res.status(404).json({ error: "Form not found" });
  if (!data.public) return res.status(403).json({ error: "Form is not public" });

  return res.json({ form: data });
});

// =============================
// PUBLIC: Upload resume (no auth)
// =============================
app.post("/public/forms/:shareToken/resume", upload.single("resume"), async (req, res) => {
  try {
    const { shareToken } = req.params;

    // 0) Validate form + is public
    const { data: form, error: formErr } = await supabase
      .from("Forms")
      .select("ID, public")
      .eq("share_token", shareToken)
      .single();

    if (formErr || !form) return res.status(404).json({ error: "Form not found" });
    if (!form.public) return res.status(403).json({ error: "Form is not public" });

    // 1) Validate file
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Resume must be a PDF" });
    }

    // 2) Upload to Storage
    const fileName = slugifyFileName(req.file.originalname);
    const path = `public/${form.ID}/${Date.now()}_${fileName}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("resumes")
      .upload(path, req.file.buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadErr) return res.status(500).json({ error: uploadErr.message });

    // 3) Extract text
    const parsed = await pdfParse(req.file.buffer);
    const resumeText = (parsed.text || "").slice(0, 12000);

    if (!resumeText.trim()) {
      return res.status(400).json({ error: "Could not read text from PDF" });
    }

    // 4) Parse to resumeProfile JSON
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

    // 5) Signed URL (optional)
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
    console.error("Public resume processing failed:", err);
    return res.status(500).json({
      error: "Resume processing failed",
      detail: err?.message || String(err),
    });
  }
});
/**
 * ✅ WHAT THIS IS FOR:
 * This is the PUBLIC version of AI follow-ups — used by /f/:shareToken pages
 * where the candidate can fill out the form without logging in.
 *
 * You DO need this, because the private route (/forms/:id/ai-next) requires auth
 * and uses a numeric form ID, not the share token.
 *
 * Both routes call the SAME generator function now, so quality is consistent.
 */
app.post("/public/forms/:shareToken/ai-next", async (req, res) => {
  const { shareToken } = req.params;
  const { history, resumeProfile } = req.body;

  const { data: form, error } = await supabase
    .from("Forms")
    .select("ID, summary, baseQuestions, aiEnabled, maxAiQuestions, public")
    .eq("share_token", shareToken)
    .single();

  if (error || !form) return res.status(404).json({ error: "Form not found" });
  if (!form.public) return res.status(403).json({ error: "Form is not public" });
  if (form.aiEnabled === false) {
    return res.status(400).json({ error: "AI follow-ups disabled for this form." });
  }

  try {
    const out = await generateFollowupQuestion({
      mode: "public",
      roleSummary: form.summary,
      baseQuestions: form.baseQuestions,
      history,
      resumeProfile,
    });

    if (!out.ok) return res.status(out.status || 500).json({ error: out.error || "AI failed" });
    return res.json({ nextQuestion: out.question });
  } catch (err) {
    console.error("AI error (public):", err);
    return res.status(500).json({ error: "AI failed" });
  }
});

// SUBMIT PUBLIC RESPONSE (NO AUTH)
app.post("/public/forms/:shareToken/responses", async (req, res) => {
  const { shareToken } = req.params;
  const { answers, resumeProfile } = req.body;

  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: "Missing answers" });
  }
  if (!resumeProfile) {
    return res.status(400).json({ error: "Resume required" });
  }

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

// =============================
// START SERVER
// =============================
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));