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
  const aiLeft = Math.max(0, (maxAiQuestions ?? 0) - aiUsed);

  const shouldSubmit = !aiEnabled || (aiLeft === 0 && !aiQuestion);

  // Load form
  useEffect(() => {
    const loadForm = async () => {
      try {
        setLoading(true);
        setLoadErr("");

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        if (!token) {
          setLoadErr("Not logged in.");
          setLoading(false);
          return;
        }

        const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setLoadErr(data?.error || `Failed to load form`);
          setLoading(false);
          return;
        }

        const form = data.forms || data.form;
        setCrank(form);
        setAiEnabled(form?.aiEnabled ?? true);
        setMaxAiQuestions(form?.maxAiQuestions ?? 2);
        setLoading(false);
      } catch (e) {
        console.log(e);
        setLoadErr("Failed to load form.");
        setLoading(false);
      }
    };

    loadForm();
  }, [id]);

  // AI Question Logic
  const getNextAiQuestion = async () => {
    if (!crank) return;
    if (!aiEnabled) return alert("AI follow-ups are disabled");
    if (aiLeft <= 0) return alert(`Max ${maxAiQuestions} AI questions reached`);
    if (aiQuestion) return alert("Answer current AI question first");

    const baseHistory = (crank.baseQuestions || []).map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    }));

    const combinedHistory = [...baseHistory, ...history];

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}/ai-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: combinedHistory,
          baseQuestions: crank.baseQuestions,
          summary: crank.summary,
          resumeProfile,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data?.error || "AI request failed");

      setAiQuestion(data.nextQuestion || "");
    } catch (err) {
      console.log(err);
      alert("AI request failed");
    }
  };

  // Submit
  const sendAnswers = async () => {
    if (!crank) return;

    const baseHistory = (crank.baseQuestions || []).map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    }));

    const fullHistory = [...baseHistory, ...history];

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ formid: id, answers: fullHistory, resumeProfile }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data?.error || "Failed to submit");

      alert("Submitted successfully!");
      navigate("/dashboard");
    } catch (e) {
      console.log(e);
      alert("Failed to submit");
    }
  };

  const handlePrimary = async () => {
    if (shouldSubmit) return sendAnswers();

    if (aiQuestion) {
      if (!aiAnswer.trim()) return alert("Answer the AI question first");

      const newHistoryItem = { question: aiQuestion, answer: aiAnswer.trim() };
      setHistory((prev) => [...prev, newHistoryItem]);
      setAiQuestion("");
      setAiAnswer("");

      if (aiUsed + 1 >= maxAiQuestions) return;

      const baseHistory = (crank.baseQuestions || []).map((q, i) => ({
        question: q,
        answer: answers[i] || "",
      }));
      const combinedHistory = [...baseHistory, ...history, newHistoryItem];

      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}/ai-next`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            history: combinedHistory,
            baseQuestions: crank.baseQuestions,
            summary: crank.summary,
            resumeProfile,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;

        setAiQuestion(data.nextQuestion || "");
      } catch (e) {
        console.log(e);
      }

      return;
    }

    await getNextAiQuestion();
  };

  if (loading) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="text-sm text-neutral-600">Loading…</div></div>;
  if (loadErr) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="text-sm text-red-600">{loadErr}</div></div>;
  if (!crank) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="text-sm text-neutral-600">Form not found</div></div>;

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="mx-auto max-w-3xl px-4">
        
        {/* Header Card */}
        <div className="mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          {/* Orange accent bar */}
          <div className="h-2.5 bg-orange-200" />
          
          <div className="p-8">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-3xl font-semibold text-neutral-900 mb-3">
                  {crank.name}
                </h1>
                <p className="text-base text-neutral-600 leading-relaxed">
                  {crank.summary}
                </p>
              </div>
              <button
                onClick={() => navigate("/dashboard")}
                className="ml-4 h-9 rounded-xl px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100 transition"
              >
                Back
              </button>
            </div>

            {/* Info badges */}
            <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-100">
              <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-neutral-100 text-neutral-700 text-xs font-medium">
                AI: {aiEnabled ? "Enabled" : "Disabled"}
              </span>
              {aiEnabled && (
                <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">
                  {aiUsed}/{maxAiQuestions} AI questions used
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Resume Upload Card */}
        <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-neutral-900">Resume</h3>
              <p className="text-sm text-neutral-500 mt-1.5">
                Upload your resume for more personalized questions
              </p>
            </div>
            
            {resumeProfile ? (
              <span className="px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                ✓ Uploaded
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-full bg-neutral-100 text-neutral-600 text-xs font-medium">
                Optional
              </span>
            )}
          </div>

          <label className="flex items-center justify-center w-full h-14 rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 hover:bg-orange-50 hover:border-orange-300 cursor-pointer transition group">
            <span className="text-sm font-medium text-neutral-600 group-hover:text-orange-700 transition">
              {resumeUploading ? "Processing…" : "Click to upload PDF"}
            </span>
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

                const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}/resume`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token}` },
                  body: formData,
                });

                const data = await res.json().catch(() => ({}));
                setResumeUploading(false);

                if (!res.ok) return alert(data?.error || "Upload failed");

                setResumeProfile(data.resumeProfile);
              }}
            />
          </label>
        </div>

        {/* Questions */}
        {questions.map((q, i) => (
          <div key={i} className="mb-5 rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
            <label className="block">
              <div className="flex items-start gap-2 mb-4">
                <span className="text-base font-medium text-neutral-900">{q}</span>
                <span className="text-red-500 text-sm">*</span>
              </div>
              <textarea
                className="w-full min-h-[100px] rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 resize-none focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 transition"
                placeholder="Your answer"
                value={answers[i] || ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
              />
            </label>
          </div>
        ))}

        {/* AI Follow-up Question */}
        {aiEnabled && aiQuestion && (
          <div className="mb-5 rounded-2xl border-2 border-orange-300 bg-orange-50 p-7 shadow-sm">
            <div className="flex items-start gap-2 mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2.5 py-1 rounded-lg bg-orange-200 text-orange-800 text-xs font-semibold">
                    AI QUESTION
                  </span>
                  <span className="text-xs text-orange-700 font-medium">
                    {aiLeft} remaining
                  </span>
                </div>
                <p className="text-base font-medium text-neutral-900">{aiQuestion}</p>
              </div>
            </div>
            <textarea
              className="w-full min-h-[120px] rounded-xl border border-orange-300 bg-white px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 resize-none focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 transition"
              placeholder="Your answer"
              value={aiAnswer}
              onChange={(e) => setAiAnswer(e.target.value)}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-4 pb-8">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="px-5 py-2.5 text-sm font-medium text-neutral-600 hover:bg-white hover:border hover:border-neutral-200 rounded-xl transition"
          >
            Cancel
          </button>

          <div className="flex gap-3">
            {!shouldSubmit && aiLeft > 0 && (
              <button
                type="button"
                onClick={handlePrimary}
                className="px-6 py-2.5 rounded-xl bg-white border border-orange-300 text-orange-700 text-sm font-medium hover:bg-orange-50 transition shadow-sm"
              >
                Next AI question
              </button>
            )}
            
            <button
              type="button"
              onClick={shouldSubmit ? handlePrimary : sendAnswers}
              className="px-8 py-2.5 rounded-xl bg-orange-200 border border-orange-200 text-neutral-900 text-sm font-semibold hover:bg-orange-300 transition shadow-sm"
            >
              Submit
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}