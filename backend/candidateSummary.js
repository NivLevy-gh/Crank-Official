// backend/candidateSummary.js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export async function generateCandidateSummaryJSON({
  formName = "",
  formSummary = "",
  answers = [],
  resumeProfile = null,
}) {
  const candidateName =
    answers?.find((x) => /name/i.test(x?.question || ""))?.answer?.trim() ||
    resumeProfile?.name ||
    "Candidate";

  const compact = {
    form: { name: formName, summary: formSummary },
    candidate: { name: candidateName },
    resumeProfile: resumeProfile || {},
    answers: (answers || []).slice(0, 25),
  };

  const system = `
You are an experienced recruiter writing a hiring-manager-ready candidate intro.

Hard rules:
- Be specific. NO generic filler like "candidate submitted an application".
- Only use facts present in the input. Do NOT invent companies, degrees, metrics, or years.
- If form.summary describes a role, tailor the summary to that role (alignment + gaps).
- Return ONLY valid JSON matching the schema exactly. No markdown. No extra keys.
`.trim();

  const user = `
SCHEMA (must match exactly):
{
  "candidate_name": string,
  "one_liner": string,
  "strengths": string[],
  "risks": string[],
  "recommended_next_step": string,
  "strength_chips": string[]
}

Rules:
- one_liner: 2–4 sentences, concrete, role-relative if possible.
- strengths: 2–5 bullets tied to specific evidence.
- risks: 0–3 bullets only if there are real gaps or missing info.
- strength_chips: 3–6 short tags (1–3 words), concrete skills/tools/signals, no fluff.

INPUT:
${JSON.stringify(compact, null, 2)}
`.trim();

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content?.trim() || "";
  const parsed = safeJsonParse(raw);

  // Fallback (still returns strength_chips)
  if (!parsed || !parsed.one_liner) {
    const skills = Array.isArray(resumeProfile?.skills) ? resumeProfile.skills : [];
    return {
      candidate_name: candidateName,
      one_liner: `${candidateName} applied for ${formName || "this role"}.`,
      strengths: skills.length
        ? [`Skills listed: ${skills.slice(0, 6).join(", ")}`]
        : [],
      risks: ["AI summary failed to generate; review resume and answers manually."],
      recommended_next_step: "Review application details and decide whether to screen.",
      strength_chips: skills.slice(0, 6),
    };
  }

  // Final normalized return
  return {
    candidate_name: parsed.candidate_name || candidateName,
    one_liner: parsed.one_liner || "",
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    recommended_next_step:
      parsed.recommended_next_step || "Review application and choose next steps.",
    strength_chips: Array.isArray(parsed.strength_chips)
      ? parsed.strength_chips
      : [],
  };
}