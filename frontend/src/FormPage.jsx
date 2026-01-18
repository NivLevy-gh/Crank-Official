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

  // Base answers
  const [answers, setAnswers] = useState({});

  // AI flow
  const [history, setHistory] = useState([]); // AI Q/A pairs
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");

  const [aiEnabled, setAiEnabled] = useState(true);
  const [maxAiQuestions, setMaxAiQuestions] = useState(2);

  // Resume (required)
  const [resumeProfile, setResumeProfile] = useState(null);
  const [resumeUploading, setResumeUploading] = useState(false);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editQuestions, setEditQuestions] = useState([]);

  const questions = useMemo(() => crank?.baseQuestions || [], [crank]);

  const aiUsed = history.length;
  const aiLeft = Math.max(0, (maxAiQuestions ?? 0) - aiUsed);

  // One button: Continue until done, then Submit
  const shouldSubmit = !aiEnabled || (aiLeft === 0 && !aiQuestion);

  const publicUrl = useMemo(() => {
    if (!crank?.share_token) return "";
    return `${window.location.origin}/f/${crank.share_token}`;
  }, [crank]);

  const copyToClipboard = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied!");
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      alert("Copied!");
    }
  };

  // -------------------------
  // Load form
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
          setLoadErr(data?.error || "Failed to load form");
          setLoading(false);
          return;
        }

        const form = data.forms || data.form;

        setCrank(form);
        setAiEnabled(form?.aiEnabled ?? true);
        setMaxAiQuestions(form?.maxAiQuestions ?? 2);

        setEditName(form?.name || "");
        setEditSummary(form?.summary || "");
        setEditQuestions(form?.baseQuestions || []);

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
  // Save edits
  // -------------------------
  const saveEdits = async () => {
    if (!crank) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return alert("Not logged in");

      const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editName,
          summary: editSummary,
          baseQuestions: editQuestions,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data?.error || "Failed to save");

      setCrank((prev) => ({
        ...prev,
        name: editName,
        summary: editSummary,
        baseQuestions: editQuestions,
      }));

      setEditMode(false);
      alert("Saved!");
    } catch (e) {
      console.log(e);
      alert("Failed to save");
    }
  };

  // -------------------------
  // Toggle public/private
  // -------------------------
  const togglePublic = async () => {
    if (!crank) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return alert("Not logged in");

      const nextPublic = !crank.public;

      // optimistic update
      setCrank((prev) => ({ ...prev, public: nextPublic }));

      const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${crank.ID}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ public: nextPublic }),
      });

      if (!res.ok) {
        setCrank((prev) => ({ ...prev, public: !nextPublic }));
        alert("Failed to update visibility");
      }
    } catch (e) {
      console.log(e);
      alert("Failed to update visibility");
    }
  };

  // -------------------------
  // AI next
  // -------------------------
  const getNextAiQuestion = async () => {
    if (!crank) return;

    if (!aiEnabled) return alert("AI follow-ups are disabled.");
    if (aiLeft <= 0) return alert(`Max ${maxAiQuestions} AI questions reached`);
    if (aiQuestion) return alert("Answer the current AI question first.");

    // resume REQUIRED
    if (!resumeProfile) return alert("Upload your resume first.");

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

  // -------------------------
  // Submit answers
  // -------------------------
  const sendAnswers = async () => {
    if (!crank) return;

    if (!resumeProfile) return alert("Upload your resume first.");

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

      alert("Submitted!");
      navigate("/dashboard");
    } catch (e) {
      console.log(e);
      alert("Failed to submit");
    }
  };

  // -------------------------
  // ONE button handler
  // -------------------------
  const handlePrimary = async () => {
    if (!resumeProfile) {
      alert("Please upload your resume first.");
      return;
    }

    if (shouldSubmit) {
      await sendAnswers();
      return;
    }

    if (aiQuestion) {
      if (!aiAnswer.trim()) return alert("Answer the AI question first.");

      const newHistoryItem = { question: aiQuestion, answer: aiAnswer.trim() };
      setHistory((prev) => [...prev, newHistoryItem]);

      setAiQuestion("");
      setAiAnswer("");

      // If we just used the last slot, stop (button becomes Submit)
      if (aiUsed + 1 >= maxAiQuestions) return;

      // Fetch next using a snapshot
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
  if (loading) {
    return (
      <div className="min-h-screen bg-[rgb(253,249,244)] flex items-center justify-center">
        <div className="text-sm text-neutral-600">Loading…</div>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="min-h-screen bg-[rgb(253,249,244)] flex items-center justify-center px-6">
        <div className="text-sm text-red-600">{loadErr}</div>
      </div>
    );
  }

  if (!crank) {
    return (
      <div className="min-h-screen bg-[rgb(253,249,244)] flex items-center justify-center">
        <div className="text-sm text-neutral-600">Form not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(253,249,244)]">
      {/* top gradient */}
      <div className="h-36 w-full bg-gradient-to-b from-[rgb(250,232,217)] to-[rgb(253,249,244)]" />

      <div className="-mt-16 pb-16">
        <div className="mx-auto w-full max-w-4xl px-4">
          {/* TOP OWNER CARD (preserved features) */}
          <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="h-1.5 bg-[rgb(242,200,168)]" />

            <div className="p-6 sm:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                {/* Title/Summary or Edit */}
                <div className="min-w-0 flex-1">
                  {!editMode ? (
                    <>
                      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900">
                        {crank.name}
                      </h1>
                      <p className="mt-2 text-sm sm:text-[15px] leading-relaxed text-neutral-600">
                        {crank.summary}
                      </p>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none focus:border-[rgb(242,200,168)] focus:ring-2 focus:ring-[rgb(251,236,221)]"
                        placeholder="Form title"
                      />
                      <textarea
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none focus:border-[rgb(242,200,168)] focus:ring-2 focus:ring-[rgb(251,236,221)]"
                        rows={3}
                        placeholder="Form description"
                      />
                    </div>
                  )}

                  {/* Badges incl followups */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                      {crank.public ? "Public" : "Private"}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                      AI: {aiEnabled ? "On" : "Off"}
                    </span>
                    {aiEnabled && (
                      <>
                        <span className="rounded-full bg-[rgb(251,236,221)] px-3 py-1 text-xs font-medium text-[rgb(166,96,43)]">
                          Used: {aiUsed}/{maxAiQuestions}
                        </span>
                        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                          Left: {aiLeft}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Owner actions */}
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <button
                    onClick={() => navigate(`/form/${id}/results`)}
                    className="h-10 rounded-xl px-4 text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition"
                  >
                    Responses
                  </button>

                  <button
                    onClick={togglePublic}
                    className="h-10 rounded-xl px-4 text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition"
                  >
                    {crank.public ? "Make Private" : "Make Public"}
                  </button>

                  <button
                    onClick={() => {
                      if (!publicUrl) return alert("No share link yet.");
                      copyToClipboard(publicUrl);
                    }}
                    className="h-10 rounded-xl px-4 text-sm font-semibold bg-[rgb(251,236,221)] text-[rgb(166,96,43)] border border-[rgb(242,200,168)] hover:bg-[rgb(247,225,205)] transition"
                  >
                    Copy share link
                  </button>

                  {!editMode ? (
                    <button
                      onClick={() => setEditMode(true)}
                      className="h-10 rounded-xl px-4 text-sm font-semibold bg-[rgb(242,200,168)] text-neutral-900 hover:bg-[rgb(235,185,150)] transition"
                    >
                      Edit
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditMode(false);
                          setEditName(crank?.name || "");
                          setEditSummary(crank?.summary || "");
                          setEditQuestions(crank?.baseQuestions || []);
                        }}
                        className="h-10 rounded-xl px-4 text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition"
                      >
                        Cancel
                      </button>

                      <button
                        onClick={saveEdits}
                        className="h-10 rounded-xl px-4 text-sm font-semibold bg-[rgb(242,200,168)] text-neutral-900 hover:bg-[rgb(235,185,150)] transition"
                      >
                        Save
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Share link field */}
              <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="text-xs font-medium text-neutral-500">Share link</div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    readOnly
                    value={publicUrl || "No share link yet"}
                    className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-800 outline-none"
                  />
                  <button
                    onClick={() => publicUrl && copyToClipboard(publicUrl)}
                    className="h-10 rounded-xl px-3 text-sm font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 transition"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Resume + Questions */}
          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Resume (required) */}
            <div className="lg:col-span-1">
              <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
                <div className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-neutral-900">
                        Resume (required)
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        Upload a PDF to continue.
                      </div>
                    </div>

                    {resumeProfile ? (
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                        ✓ Loaded
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                        Required
                      </span>
                    )}
                  </div>

                  <label className="mt-4 flex cursor-pointer items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm transition hover:border-[rgb(242,200,168)] hover:bg-[rgb(251,236,221)]">
                    <span className="font-medium text-neutral-800">
                      {resumeUploading ? "Processing…" : "Upload PDF"}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {resumeUploading ? "Please wait" : "Choose file"}
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

                        const res = await fetch(
                          `${import.meta.env.VITE_API_URL}/forms/${id}/resume`,
                          {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                            body: formData,
                          }
                        );

                        const data = await res.json().catch(() => ({}));
                        setResumeUploading(false);

                        if (!res.ok) {
                          alert(data?.error || "Resume upload failed");
                          return;
                        }

                        console.log("resumeProfile:", data.resumeProfile);
                        setResumeProfile(data.resumeProfile);
                        alert("Resume processed ✅");
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Questions */}
            <div className="lg:col-span-2 space-y-4">
              {!editMode ? (
                questions.map((q, i) => (
                  <div
                    key={i}
                    className="rounded-3xl border border-neutral-200 bg-white shadow-sm"
                  >
                    <div className="p-6">
                      <div className="text-sm font-semibold text-neutral-900">{q}</div>
                      <textarea
                        className="mt-3 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[rgb(242,200,168)] focus:ring-2 focus:ring-[rgb(251,236,221)]"
                        rows={4}
                        placeholder="Your answer"
                        value={answers[i] || ""}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-neutral-900">
                          Questions
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          Edit base questions (applicants see these).
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setEditQuestions((prev) => [...prev, ""])}
                        className="h-9 rounded-xl px-3 text-xs font-semibold bg-[rgb(251,236,221)] text-[rgb(166,96,43)] border border-[rgb(242,200,168)] hover:bg-[rgb(247,225,205)] transition"
                      >
                        + Add
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {editQuestions.map((q, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            value={q}
                            onChange={(e) =>
                              setEditQuestions((prev) =>
                                prev.map((x, i) => (i === idx ? e.target.value : x))
                              )
                            }
                            className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[rgb(242,200,168)] focus:ring-2 focus:ring-[rgb(251,236,221)]"
                            placeholder={`Question ${idx + 1}`}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              setEditQuestions((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="h-10 rounded-xl px-3 text-sm font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 transition"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* AI follow-up */}
              {aiEnabled && aiQuestion && (
                <div className="rounded-3xl border border-[rgb(242,200,168)] bg-[rgb(251,236,221)] shadow-sm">
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <span className="rounded-lg bg-white/70 px-2.5 py-1 text-xs font-semibold text-[rgb(166,96,43)]">
                        AI follow-up
                      </span>
                      <span className="text-xs font-semibold text-[rgb(166,96,43)]">
                        {aiLeft} left
                      </span>
                    </div>

                    <div className="mt-3 text-sm font-semibold text-neutral-900">
                      {aiQuestion}
                    </div>

                    <textarea
                      className="mt-3 w-full rounded-2xl border border-[rgb(242,200,168)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[rgb(222,150,90)] focus:ring-2 focus:ring-[rgb(251,236,221)]"
                      rows={4}
                      placeholder="Your answer"
                      value={aiAnswer}
                      onChange={(e) => setAiAnswer(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Bottom actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="h-10 rounded-xl px-4 text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition"
                >
                  Exit
                </button>

                <button
                  type="button"
                  onClick={handlePrimary}
                  className="h-10 rounded-xl px-5 text-sm font-semibold bg-[rgb(242,200,168)] text-neutral-900 hover:bg-[rgb(235,185,150)] transition shadow-sm"
                >
                  {shouldSubmit ? "Submit" : "Continue"}
                </button>
              </div>

              {aiEnabled && !aiQuestion && aiLeft > 0 && (
                <div className="text-xs text-neutral-500 px-1">
                  Click <span className="font-semibold">Continue</span> to generate an AI follow-up.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}