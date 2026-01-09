require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const app = express();
app.use(express.json());
app.use(cors());

const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const multer = require("multer");

const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const upload = multer({ storage: multer.memoryStorage() });

// helper: safe filename
function slugifyFileName(name = "resume.pdf") {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

app.post("/forms/:id/resume", upload.single("resume"), async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Not logged in" });

    const { id: formId } = req.params;

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Resume must be a PDF" });
    }

    // 1) Upload to Supabase Storage (private)
    const fileName = slugifyFileName(req.file.originalname);
    const path = `${user.id}/${formId}/${Date.now()}_${fileName}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("resumes")
      .upload(path, req.file.buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadErr) return res.status(500).json({ error: uploadErr.message });

    // 2) Create a signed URL so the client can access if needed (optional)
    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from("resumes")
      .createSignedUrl(path, 60 * 60); // 1 hour

    if (signedErr) return res.status(500).json({ error: signedErr.message });

    // 3) Extract text from PDF
    const parsed = await pdfParse(req.file.buffer);
    const resumeText = (parsed.text || "").slice(0, 12000);

    if (!resumeText.trim()) {
      return res.status(400).json({ error: "Could not read text from PDF" });
    }

    // 4) Ask OpenAI to produce a resume_profile JSON
    const system = `You extract structured resume info for hiring screening.
Return ONLY valid JSON. No markdown.`;

    const userMsg = `
Extract a compact JSON object from this resume text.

Return JSON with these keys:
{
  "name": string|null,
  "email": string|null,
  "roles": string[],
  "skills": string[],
  "companies": string[],
  "education": [{"school": string|null, "degree": string|null, "major": string|null}],
  "years_experience": number|null,
  "highlights": string[]
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

    let raw = completion.choices?.[0]?.message?.content?.trim() || "";
    // best-effort JSON parse
    let resumeProfile;
    try {
      resumeProfile = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: "Failed to parse resume JSON" });
    }

    // 5) Return to frontend
    return res.json({
      resumeUrl: signed.signedUrl, // signed url (temporary)
      resumePath: path,            // permanent storage path
      resumeProfile,               // the JSON object you’ll use for AI questions
    });
  } catch (err) {
    console.error("Resume processing failed:", err);
    return res.status(500).json({
      error: "Resume processing failed",
      detail: err?.message || String(err),
    });
  }
  
});



app.post("/forms/:id/ai-next", async (req, res) => {
  const { summary, baseQuestions, history, resumeProfile } = req.body; 
  // resumeProfile is OPTIONAL (you can omit sending it for now)
  console.log("resumeProfile received:", resumeProfile);
  try {
    const prompt = `
You are an AI SCREENING INTERVIEWER for a job application.

Goal:
Ask ONE next question that increases hiring signal (skill depth, ownership, impact, decision-making).
The question should feel like a real interviewer, not a survey.

ROLE / JOB CONTEXT:
${summary}

STARTER QUESTIONS (always asked first):
${JSON.stringify(baseQuestions)}

CANDIDATE CONTEXT (optional resume summary JSON):
${JSON.stringify(resumeProfile || {})}

CONVERSATION SO FAR (question/answer pairs):
${JSON.stringify(history)}

How to choose the next question:
1) Look at the most recent answer and ask a deeper follow-up about specifics:
   - what they personally did
   - tools/stack used
   - constraints/tradeoffs
   - measurable outcome (numbers if possible)
2) If the last answer is vague ("worked on frontend", "helped build"), ask for one concrete example/project.
3) If they mention a skill/tech, ask a depth question about how they used it and why.
4) If they mention a challenge, ask how they debugged or made a decision.
5) Never ask about protected traits (age, race, religion, gender, etc.). Keep it job-related.

Rules:
- Ask exactly ONE question.
- Make it specific to their last answer + resumeProfile (if present).
- Do NOT repeat any prior question from baseQuestions or history.
- No multi-part questions. (No "and also...")
- Keep it under 20 words unless absolutely necessary.
- If the last answer is nonsense/empty, ask them to clarify what they meant.

Return ONLY the question text. No quotes, no bullet points.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    let nextQuestion = completion.choices?.[0]?.message?.content?.trim();

    // Safety cleanup in case the model adds quotes/bullets
    if (nextQuestion) {
      nextQuestion = nextQuestion
        .replace(/^["'`•\-\s]+/, "")
        .replace(/["'`]+$/, "")
        .trim();
    }

    if (!nextQuestion) {
      return res.status(500).json({ error: "No question generated" });
    }

    res.json({ nextQuestion });
  } catch (err) {
    console.error("AI error:", err);
    res.status(500).json({ error: "AI request failed" });
  }
});



  async function getUserFromRequest(req) {
    const auth = req.headers.authorization || "";
    const token = auth.replace("Bearer ", "");
    if (!token) return null;
  
    const { data, error } = await supabase.auth.getUser(token);
    if (error) return null;
  
    return data.user;
  }
  
  app.post("/forms", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Not logged in" });
  
    const { name, summary, baseQuestions, aiEnabled, maxAiQuestions } = req.body;
  
    console.log("hi", name);

    const { data, error } = await supabase
      .from("Forms")
      .insert({ name, summary, baseQuestions, user_id: user.id, aiEnabled, maxAiQuestions })
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
      .select("ID, name, summary, baseQuestions")
      .eq("user_id", user.id);
  
    if (error) return res.status(500).json({ error: error.message });
  
    return res.json({ forms: data });
  });

  app.get("/forms/:id", async (req, res) => {
    const { id } = req.params;
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Not logged in" });
    
    const { data, error } = await supabase
      .from("Forms")
      .select("ID, name, summary, baseQuestions")
      .eq("ID", id)
      .eq("user_id", user.id)  // ← Add this line to check ownership
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Form not found" });
    
    return res.json({ forms: data });
  });

app.post('/forms/:id/responses', async (req, res) => {
    const { id } = req.params;
    const { formid, answers, resumeProfile } = req.body;

    const { data, error } = await supabase
      .from("Responses")
      .insert({ formid, answers, resume_profile: resumeProfile })
      .select()
      .single();
    
    res.json({form:data}); 
    console.log("we good")
});


app.listen(5001)