// FormPage.jsx
import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";

import logo from "./assets/logo.png";

export default function FormPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [crank, setCrank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");

  // Base answers (index -> text)
  const [answers, setAnswers] = useState({});

  // AI flow
  const [history, setHistory] = useState([]); // saved AI Q/A pairs
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");

  const [aiEnabled, setAiEnabled] = useState(true);
  const [maxAiQuestions, setMaxAiQuestions] = useState(2);

  const [resumeProfile, setResumeProfile] = useState(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  

  const questions = useMemo(() => crank?.baseQuestions || [], [crank]);

  const aiUsed = history.length;
  const aiLeft = Math.max(0, (maxAiQuestions ?? 0) - aiUsed);

  // Button label logic:
  // - If AI is off => can submit anytime
  // - If AI is on => submit only when you've used all AI followups AND there's no current pending AI question
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

        const res = await fetch(`http://localhost:5001/forms/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setLoadErr(data?.error || `Failed to load form (${res.status})`);
          setLoading(false);
          return;
        }

        setCrank(data.forms);
        setAiEnabled(data.forms?.aiEnabled ?? true);
        setMaxAiQuestions(data.forms?.maxAiQuestions ?? 2);

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
  
  // -------------------------
  const getNextAiQuestion = async () => {
    if (!crank) return;

    if (!aiEnabled) {
      alert("AI follow-ups are disabled for this form.");
      return;
    }

    if (aiLeft <= 0) {
      alert(`You’ve reached the max of ${maxAiQuestions} AI follow-up questions.`);
      return;
    }

    if (aiQuestion) {
      alert("Answer the current AI question first.");
      return;
    }

    const baseHistory = (crank.baseQuestions || []).map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    }));

    const combinedHistory = [...baseHistory, ...history];

    try {
      const res = await fetch(`http://localhost:5001/forms/${id}/ai-next`, {
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

      if (!res.ok) {
        alert(data?.error || "AI request failed");
        return;
      }

      if (data.should_stop) {
        alert(data.reason || "No more AI questions.");
        return;
      }

      setAiQuestion(data.nextQuestion || "");
    } catch (err) {
      alert("AI request failed");
      console.log(err);
    }
  };

  // -------------------------
  // Submit all answers
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

      const res = await fetch(`http://localhost:5001/forms/${id}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ formid: id, answers: fullHistory, resumeProfile, }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data?.error || "Failed to submit");
        return;
      }

      console.log("Saved responses:", data);
      alert("Submitted!");
    } catch (e) {
      console.log(e);
      alert("Failed to submit");
    }
  };

  // -------------------------
  // ONE BUTTON HANDLER
  // -------------------------
  const handlePrimary = async () => {
    // If the button says Submit, submit.
    if (shouldSubmit) {
      await sendAnswers();
      return;
    }

    // Otherwise the button says "Next question"
    // If there is an AI question showing: save answer and either fetch next or become submit.
    if (aiQuestion) {
      if (!aiAnswer.trim()) return alert("Answer the AI question first.");

      const newHistoryItem = { question: aiQuestion, answer: aiAnswer.trim() };
      setHistory((prev) => [...prev, newHistoryItem]);

      // Clear current AI Q/A
      setAiQuestion("");
      setAiAnswer("");

      // If that answer used up the last AI slot, we’re done.
      if (aiUsed + 1 >= maxAiQuestions) return;

      // Otherwise fetch the next AI question
      // NOTE: we need to wait a tick so `history` is updated.
      // Easiest: build a "combinedHistory" manually using the new item.
      const baseHistory = (crank.baseQuestions || []).map((q, i) => ({
        question: q,
        answer: answers[i] || "",
      }));
      const combinedHistory = [...baseHistory, ...history, newHistoryItem];

      try {
        const res = await fetch(`http://localhost:5001/forms/${id}/ai-next`, {
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

    // No AI question currently on screen -> generate the next one
    await getNextAiQuestion();
  };

  // -------------------------
  // Render guards
  // -------------------------
  if (loading) return <p className="text-white p-6">Loading...</p>;
  if (loadErr) return <p className="text-white p-6">{loadErr}</p>;
  if (!crank) return <p className="text-white p-6">Form not found.</p>;

  return (
    <div className="min-h-screen bg-neutral-900/98 text-white">
      {/* Top bar */}
      <div className="border-b border-neutral-800 px-6 py-4 flex items-center">
        <img src={logo} className="w-28 h-8 cursor-pointer" alt="logo" onClick={() => navigate("/dashboard")}/>
        <div className="ml-auto w-10 h-10 border border-neutral-700 rounded-full" />
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">{crank.name}</h1>
          <p className="mt-2 text-sm text-neutral-400">{crank.summary}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs text-neutral-300">
              AI: {aiEnabled ? "On" : "Off"}
            </span>
            {aiEnabled && (
              <span className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs text-neutral-300">
                Follow-ups used: {aiUsed}/{maxAiQuestions}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-neutral-800 bg-neutral-800 p-6">
  <div className="text-sm font-semibold">Resume (PDF)</div>
  <p className="mt-1 text-sm text-neutral-400">
    Upload your resume so the interview can ask better questions.
  </p>

  <input
    type="file"
    accept="application/pdf"
    className="mt-4 block w-full text-sm"
    onChange={async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setResumeUploading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const formData = new FormData();
      formData.append("resume", file);

      const res = await fetch(`http://localhost:5001/forms/${id}/resume`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      setResumeUploading(false);

      if (!res.ok) {
        alert(data?.error || "Resume upload failed");
        return;
      }

      console.log(data.resumeProfile);
      setResumeProfile(data.resumeProfile);
      alert("Resume processed ✅");
    }}
  />

  {resumeUploading && (
    <div className="mt-3 text-xs text-neutral-400">Processing resume…</div>
  )}

  {resumeProfile && (
    <div className="mt-3 text-xs text-neutral-400">
      Resume loaded • {resumeProfile.skills?.length || 0} skills detected
    </div>
  )}
</div>



        {/* Base questions */}
        <div className="rounded-3xl border border-neutral-800 bg-neutral-800 p-6">
          <h2 className="text-lg font-semibold">Questions</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Answer these. Then click “Next question” to generate AI follow-ups.
          </p>

          <div className="mt-6 flex flex-col gap-4">
            {questions.map((q, i) => (
              <div
                key={i}
                className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
              >
                <div className="text-sm font-medium text-white">{q}</div>
                <textarea
                  className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-900/98 px-4 py-3 text-sm outline-none focus:border-neutral-600"
                  rows={3}
                  placeholder="Type your answer..."
                  value={answers[i] || ""}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {/* AI section */}
        {aiEnabled && (
          <div className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
            <h2 className="text-lg font-semibold">AI follow-up</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Click “Next question” to generate a follow-up. Answer it, then click
              “Next question” again.
            </p>

            {!aiQuestion && aiLeft > 0 && (
              <div className="mt-4 text-sm text-neutral-400">
                No AI question yet. Click “Next question” to generate one.
              </div>
            )}

            {aiQuestion && (
              <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-400">AI Question</div>
                <div className="mt-2 text-sm">{aiQuestion}</div>

                <textarea
                  className="mt-4 w-full rounded-2xl border border-neutral-800 !bg-neutral-900/98 px-4 py-3 text-sm outline-none focus:border-neutral-600"
                  rows={3}
                  placeholder="Type your answer..."
                  value={aiAnswer}
                  onChange={(e) => setAiAnswer(e.target.value)}
                />
              </div>
            )}

          </div>
        )}

        {/* ONE button */}
        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={handlePrimary}
            className="rounded-2xl bg-white px-6 py-3 text-sm font-medium text-black"
          >
            {shouldSubmit ? "Submit" : "Next question"}
          </button>
        </div>
      </div>
    </div>
  );
}
