// FormPage.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

export default function FormPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [crank, setCrank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");

  const [answers, setAnswers] = useState({});
  const [history, setHistory] = useState([]);

  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");

  const [aiEnabled, setAiEnabled] = useState(true);
  const [maxAiQuestions, setMaxAiQuestions] = useState(2);

  const [resumeProfile, setResumeProfile] = useState(null);
  const [resumeUploading, setResumeUploading] = useState(false);

  const questions = useMemo(() => crank?.baseQuestions || [], [crank]);

  const aiUsed = history.length;
  const aiLeft = Math.max(0, maxAiQuestions - aiUsed);
  const shouldSubmit = !aiEnabled || (aiLeft === 0 && !aiQuestion);

  /* ---------------- Load form ---------------- */
  useEffect(() => {
    const loadForm = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return setLoadErr("Not logged in");

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/forms/${id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await res.json();
        if (!res.ok) return setLoadErr(data?.error || "Failed to load");

        const form = data.forms || data.form;
        setCrank(form);
        setAiEnabled(form.aiEnabled ?? true);
        setMaxAiQuestions(form.maxAiQuestions ?? 2);
        setLoading(false);
      } catch {
        setLoadErr("Failed to load form");
        setLoading(false);
      }
    };

    loadForm();
  }, [id]);

  /* ---------------- AI fetch ---------------- */
  const fetchNextAi = async (combinedHistory) => {
    const res = await fetch(
      `${import.meta.env.VITE_API_URL}/forms/${id}/ai-next`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: combinedHistory,
          baseQuestions: crank.baseQuestions,
          summary: crank.summary,
          resumeProfile, // REQUIRED & always passed
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "AI failed");

    setAiQuestion(data.nextQuestion || "");
  };

  /* ---------------- Submit ---------------- */
  const submitAll = async () => {
    const baseHistory = questions.map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    }));

    const fullHistory = [...baseHistory, ...history];

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch(
      `${import.meta.env.VITE_API_URL}/forms/${id}/responses`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          formid: id,
          answers: fullHistory,
          resumeProfile,
        }),
      }
    );

    if (!res.ok) return alert("Failed to submit");
    navigate("/dashboard");
  };

  /* ---------------- Primary button ---------------- */
  const handlePrimary = async () => {
    // Resume REQUIRED
    if (!resumeProfile) {
      alert("Please upload your resume to continue");
      return;
    }

    // SUBMIT
    if (shouldSubmit) {
      await submitAll();
      return;
    }

    // ANSWER AI
    if (aiQuestion) {
      if (!aiAnswer.trim()) return alert("Answer the AI question first");

      const newItem = { question: aiQuestion, answer: aiAnswer.trim() };
      const nextHistory = [...history, newItem];

      setHistory(nextHistory);
      setAiQuestion("");
      setAiAnswer("");

      if (nextHistory.length >= maxAiQuestions) return;

      const baseHistory = questions.map((q, i) => ({
        question: q,
        answer: answers[i] || "",
      }));

      await fetchNextAi([...baseHistory, ...nextHistory]);
      return;
    }

    // GENERATE FIRST AI
    const baseHistory = questions.map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    }));

    await fetchNextAi([...baseHistory, ...history]);
  };

  /* ---------------- Guards ---------------- */
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-neutral-600">
        Loading…
      </div>
    );

  if (loadErr)
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-red-600">
        {loadErr}
      </div>
    );

  if (!crank)
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-neutral-600">
        Form not found
      </div>
    );

  /* ---------------- UI ---------------- */
  return (
    <div className="min-h-screen bg-[rgb(253,249,244)] px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{crank.name}</h1>
          <p className="mt-1 text-sm text-neutral-600">{crank.summary}</p>
        </div>

        {/* Resume (REQUIRED) */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-neutral-900">Resume</div>
              <div className="text-xs text-neutral-500">Required to continue</div>
            </div>

            {resumeProfile ? (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                ✓ Uploaded
              </span>
            ) : (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                Required
              </span>
            )}
          </div>

          <label className="mt-4 block cursor-pointer rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm hover:bg-neutral-100">
            {resumeUploading ? "Processing…" : "Upload PDF"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                setResumeUploading(true);
                const { data: sessionData } = await supabase.auth.getSession();
                const token = sessionData.session?.access_token;

                const formData = new FormData();
                formData.append("resume", file);

                const res = await fetch(
                  `${import.meta.env.VITE_API_URL}/forms/${id}/resume`,
                  {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                  }
                );

                const data = await res.json();
                setResumeUploading(false);

                if (!res.ok) return alert(data?.error || "Upload failed");
                setResumeProfile(data.resumeProfile);
              }}
            />
          </label>
        </div>

        {/* Base questions */}
        {questions.map((q, i) => (
          <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="text-sm font-semibold text-neutral-900">{q}</div>
            <textarea
              className="mt-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
              rows={3}
              value={answers[i] || ""}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [i]: e.target.value }))
              }
            />
          </div>
        ))}

        {/* AI Follow-up */}
        {aiEnabled && aiQuestion && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
            <div className="text-xs font-semibold text-orange-700">AI follow-up</div>
            <div className="mt-2 text-sm font-medium">{aiQuestion}</div>
            <textarea
              className="mt-3 w-full rounded-xl border border-orange-200 px-3 py-2 text-sm"
              rows={3}
              value={aiAnswer}
              onChange={(e) => setAiAnswer(e.target.value)}
            />
          </div>
        )}

        {/* Primary CTA */}
        <div className="flex justify-end">
          <button
            onClick={handlePrimary}
            className="rounded-xl bg-orange-300 px-6 py-3 text-sm font-semibold text-neutral-900 hover:bg-orange-400 transition"
          >
            {shouldSubmit ? "Submit" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}