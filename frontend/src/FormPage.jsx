// FormPage.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import logo from "./assets/logo.png";
import Navbar from "./Navbar";

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

  // -------------------------
  // Load form (auth required)
  // -------------------------
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
          setLoadErr(data?.error || `Failed to load form (${res.status})`);
          setLoading(false);
          return;
        }

        const form = data.forms || data.form;
        setCrank(form);
        setAiEnabled(form?.aiEnabled ?? true);
        setMaxAiQuestions(form?.maxAiQuestions ?? 2);


        console.log("FORM FROM BACKEND:", form);
        console.log("maxAiQuestions:", form?.maxAiQuestions);
        setLoading(false);
      } catch (e) {
        console.log(e);
        setLoadErr("Failed to load form.");
        setLoading(false);
      }
    };

    loadForm();
  }, [id]);

  // -------------------------
  // AI
  // -------------------------
  const getNextAiQuestion = async () => {
    if (!crank) return;

    if (!aiEnabled) return alert("AI follow-ups are disabled for this form.");
    if (aiLeft <= 0) return alert(`You’ve reached the max of ${maxAiQuestions} AI follow-up questions.`);
    if (aiQuestion) return alert("Answer the current AI question first.");

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
      if (data.should_stop) return alert(data.reason || "No more AI questions.");

      setAiQuestion(data.nextQuestion || "");
    } catch (err) {
      console.log(err);
      alert("AI request failed");
    }
  };

  // -------------------------
  // Submit
  // -------------------------
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

      console.log("Saved responses:", data);
      alert("Submitted!");
    } catch (e) {
      console.log(e);
      alert("Failed to submit");
    }
  };

  const handlePrimary = async () => {
    if (shouldSubmit) return sendAnswers();

    if (aiQuestion) {
      if (!aiAnswer.trim()) return alert("Answer the AI question first.");

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
        if (!res.ok) return alert(data?.error || "AI request failed");
        if (data.should_stop) return alert(data.reason || "No more AI questions.");

        setAiQuestion(data.nextQuestion || "");
      } catch (e) {
        console.log(e);
        alert("AI request failed");
      }

      return;
    }

    await getNextAiQuestion();
  };

  // -------------------------
  // Render guards
  // -------------------------
  if (loading) return <div className="min-h-screen bg-white p-6 text-sm text-neutral-600">Loading…</div>;
  if (loadErr) return <div className="min-h-screen bg-white p-6 text-sm text-red-600">{loadErr}</div>;
  if (!crank) return <div className="min-h-screen bg-white p-6 text-sm text-neutral-600">Form not found.</div>;

  return (
      <div className="min-h-screen bg-white">
    <Navbar />
    {/* page content */}
 

      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
        <div className="flex">
          <h1 className="text-2xl font-semibold tracking-tight">{crank.name}</h1>
          <button
            onClick={() => navigate("/dashboard")}
            className="h-9 ml-auto rounded-xl px-3 text-xs font-medium border border-neutral-200 bg-white text-neutral-900 shadow-sm transition hover:bg-neutral-50 hover:border-neutral-300 active:scale-[0.99]"
          >
            Back
          </button>
          </div>

          <p className="mt-2 text-sm text-neutral-600">{crank.summary}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-700">
              AI: {aiEnabled ? "On" : "Off"}
            </span>
            {aiEnabled && (
              <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs text-orange-700">
                Follow-ups: {aiUsed}/{maxAiQuestions}
              </span>
            )}
          </div>
        </div>

        {/* Resume */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Resume</div>
              <div className="mt-1 text-xs text-neutral-600">Helps the interview ask better questions.</div>
            </div>

            {resumeProfile ? (
              <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs text-green-700">
                Loaded
              </span>
            ) : (
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                Not uploaded
              </span>
            )}
          </div>

          <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm transition hover:border-orange-200 hover:bg-orange-50">
            <span className="text-neutral-800">Upload PDF</span>
            <span className="text-xs text-neutral-500">{resumeUploading ? "Processing…" : "Choose file"}</span>
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

                if (!res.ok) return alert(data?.error || "Resume upload failed");

                setResumeProfile(data.resumeProfile);
              }}
            />
          </label>
        </div>

        {/* Questions */}
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Questions</h2>
              <p className="mt-1 text-xs text-neutral-600">Answer these first.</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-4">
            {questions.map((q, i) => (
              <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="text-sm font-medium text-neutral-900">{q}</div>
                <textarea
                  className="mt-3 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                  rows={3}
                  placeholder="Type your answer…"
                  value={answers[i] || ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* AI Follow-up */}
        {aiEnabled && (
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">AI follow-up</h2>
                <p className="mt-1 text-xs text-neutral-600">Optional. One question at a time.</p>
              </div>

              <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs text-orange-700">
                {aiLeft} left
              </span>
            </div>

            {!aiQuestion && aiLeft > 0 && (
              <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                No follow-up yet.
              </div>
            )}

            {aiQuestion && (
              <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <div className="text-xs font-semibold text-orange-700">AI Question</div>
                <div className="mt-2 text-sm text-neutral-900">{aiQuestion}</div>

                <textarea
                  className="mt-3 w-full rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                  rows={3}
                  placeholder="Type your answer…"
                  value={aiAnswer}
                  onChange={(e) => setAiAnswer(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {/* Primary button */}
        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={handlePrimary}
            className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-[1px] hover:opacity-95 active:translate-y-0"
          >
            {shouldSubmit ? "Submit" : "Next question"}
          </button>
        </div>
      </div>
    </div>
  );
}