// FormPage.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

/**
 * Lightweight toast (replaces alert())
 */
function Toast({ toast, onClose }) {
  if (!toast) return null;

  const styles =
    toast.type === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : toast.type === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : "border-neutral-200 bg-white text-neutral-800";

  return (
    <div className="fixed left-1/2 top-4 z-[9999] w-[92%] max-w-md -translate-x-1/2">
      <div className={`rounded-2xl border px-4 py-3 shadow-lg ${styles}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold">{toast.title || "Notice"}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm opacity-70 hover:bg-black/5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {toast.message && (
          <div className="mt-1 text-sm opacity-90">{toast.message}</div>
        )}
      </div>
    </div>
  );
}

export default function FormPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [crank, setCrank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");

  // Base answers (index -> string)
  const [answers, setAnswers] = useState({});

  // AI flow
  const [history, setHistory] = useState([]); // AI Q/A pairs only
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

  // Toast (no browser alert())
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const notify = (type, title, message) => {
    setToast({ type, title, message });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  };

  const questions = useMemo(() => crank?.baseQuestions || [], [crank]);

  const aiUsed = history.length;
  const aiLeft = Math.max(0, (maxAiQuestions ?? 0) - aiUsed);

  // One button: Continue until no follow-ups left, then Submit.
  const shouldSubmit = !aiEnabled || aiLeft === 0;

  const publicUrl = useMemo(() => {
    if (!crank?.share_token) return "";
    return `${window.location.origin}/f/${crank.share_token}`;
  }, [crank]);

  const copyToClipboard = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      notify("success", "Copied", "Share link copied.");
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        notify("success", "Copied", "Share link copied.");
      } catch {
        notify("error", "Copy failed", "Please copy manually.");
      }
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

        const { data: sessionData, error: sessionErr } =
          await supabase.auth.getSession();

        if (sessionErr) console.error(sessionErr);

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

        const form = data.form || data.forms;
        if (!form) {
          setLoadErr("Form not found.");
          setLoading(false);
          return;
        }

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

      if (!token) {
        notify("error", "Not logged in", "Please log in again.");
        return;
      }

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
      if (!res.ok) {
        notify("error", "Save failed", data?.error || "Failed to save changes.");
        return;
      }

      setCrank((prev) => ({
        ...prev,
        name: editName,
        summary: editSummary,
        baseQuestions: editQuestions,
      }));

      setEditMode(false);
      notify("success", "Saved", "Your form was updated.");
    } catch (e) {
      console.log(e);
      notify("error", "Save failed", "Please try again.");
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

      if (!token) {
        notify("error", "Not logged in", "Please log in again.");
        return;
      }

      const nextPublic = !crank.public;

      // optimistic
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
        notify("error", "Update failed", "Could not change visibility.");
        return;
      }

      notify(
        "success",
        "Updated",
        nextPublic ? "Form is now public." : "Form is now private."
      );
    } catch (e) {
      console.log(e);
      notify("error", "Update failed", "Could not change visibility.");
    }
  };

  // -------------------------
  // Resume upload (required)
  // -------------------------
  const uploadResume = async (file) => {
    if (!file) return;

    if (file.type !== "application/pdf") {
      notify("error", "Invalid file", "Please upload a PDF.");
      return;
    }

    try {
      setResumeUploading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setResumeUploading(false);
        notify("error", "Not logged in", "Please log in again.");
        return;
      }

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
        notify("error", "Resume failed", data?.error || "Resume upload failed.");
        return;
      }

      setResumeProfile(data.resumeProfile);
      notify("success", "Resume processed", "Resume is loaded and ready.");
    } catch (e) {
      console.log(e);
      setResumeUploading(false);
      notify("error", "Resume failed", "Resume upload failed.");
    }
  };

  // -------------------------
  // AI next question (OWNER)
  // -------------------------
  const fetchNextAiQuestion = async (combinedHistory) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      notify("error", "Not logged in", "Please log in again.");
      return null;
    }

    const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}/ai-next`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        history: combinedHistory,
        baseQuestions: crank.baseQuestions,
        summary: crank.summary,
        resumeProfile,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify("error", "AI failed", data?.error || "AI request failed.");
      return null;
    }

    return (data.nextQuestion || "").trim();
  };

  // -------------------------
  // Submit answers
  // -------------------------
  const sendAnswers = async () => {
    if (!crank) return;

    if (!resumeProfile) {
      notify("error", "Resume required", "Upload your resume before submitting.");
      return;
    }

    const baseHistory = (crank.baseQuestions || []).map((q, i) => ({
      question: q,
      answer: (answers[i] || "").trim(),
    }));

    const fullHistory = [...baseHistory, ...history];

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        notify("error", "Not logged in", "Please log in again.");
        return;
      }

      const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ answers: fullHistory, resumeProfile }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify("error", "Submit failed", data?.error || "Failed to submit.");
        return;
      }

      notify("success", "Submitted", "Response submitted successfully.");
      window.setTimeout(() => navigate("/dashboard"), 500);
    } catch (e) {
      console.log(e);
      notify("error", "Submit failed", "Failed to submit.");
    }
  };

  // -------------------------
  // ONE button handler
  // -------------------------
  const handlePrimary = async () => {
    if (!crank) return;

    if (!resumeProfile) {
      notify("error", "Resume required", "Upload your resume to continue.");
      return;
    }

    // If we're done with follow-ups, submit
    if (shouldSubmit) {
      await sendAnswers();
      return;
    }

    // Base answers snapshot
    const baseHistory = (crank.baseQuestions || []).map((q, i) => ({
      question: q,
      answer: (answers[i] || "").trim(),
    }));

    // If an AI question is showing, store it then fetch next
    if (aiQuestion) {
      const trimmed = (aiAnswer || "").trim();
      if (!trimmed) {
        notify("error", "Missing answer", "Type an answer for the AI follow-up.");
        return;
      }

      const newHistoryItem = { question: aiQuestion, answer: trimmed };
      const nextHistory = [...history, newHistoryItem];
      const combinedHistory = [...baseHistory, ...nextHistory];

      setHistory(nextHistory);
      setAiQuestion("");
      setAiAnswer("");

      if (nextHistory.length >= maxAiQuestions) {
        notify("success", "Saved", "AI follow-up saved. You can submit now.");
        return;
      }

      const nextQ = await fetchNextAiQuestion(combinedHistory);
      if (nextQ) setAiQuestion(nextQ);
      return;
    }

    // No AI question yet: fetch first/next
    const combinedHistory = [...baseHistory, ...history];
    const nextQ = await fetchNextAiQuestion(combinedHistory);
    if (nextQ) setAiQuestion(nextQ);
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
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadErr}
        </div>
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
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* top gradient */}
      <div className="h-36 w-full bg-gradient-to-b from-[rgb(250,232,217)] to-[rgb(253,249,244)]" />

      <div className="-mt-16 pb-16">
        <div className="mx-auto w-full max-w-4xl px-4">
          {/* TOP OWNER CARD */}
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

                  {/* Badges */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                      {crank.public ? "Public" : "Private"}
                    </span>

                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                      AI: {aiEnabled ? "On" : "Off"}
                    </span>

                    {aiEnabled && (
                      <div className="rounded-full bg-[rgb(251,236,221)] px-3 py-1 text-xs font-medium text-[rgb(166,96,43)]">
                        Follow-ups: {aiUsed}/{maxAiQuestions}
                      </div>
                    )}
                  </div>
                </div>

                {/* Owner actions */}
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => navigate(`/form/${id}/results`)}
                    className="h-10 rounded-xl px-4 text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition"
                  >
                    Responses
                  </button>

                  <button
                    type="button"
                    onClick={togglePublic}
                    className="h-10 rounded-xl px-4 text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition"
                  >
                    {crank.public ? "Make Private" : "Make Public"}
                  </button>

                  {/* Share link button (no URL shown) */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!crank.public) {
                        notify("error", "Not public", "Make the form public to share.");
                        return;
                      }
                      if (!publicUrl) {
                        notify("error", "No link", "This form has no share link yet.");
                        return;
                      }
                      copyToClipboard(publicUrl);
                    }}
                    className="h-10 rounded-xl px-4 text-sm font-semibold
                               border border-neutral-200 bg-white
                               hover:bg-[rgb(251,236,221)]
                               text-neutral-800 transition"
                  >
                    Share link
                  </button>

                  {!editMode ? (
                    <button
                      type="button"
                      onClick={() => setEditMode(true)}
                      className="h-10 rounded-xl px-4 text-sm font-semibold bg-[rgb(242,200,168)] text-neutral-900 hover:bg-[rgb(235,185,150)] transition"
                    >
                      Edit
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
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
                        type="button"
                        onClick={saveEdits}
                        className="h-10 rounded-xl px-4 text-sm font-semibold bg-[rgb(242,200,168)] text-neutral-900 hover:bg-[rgb(235,185,150)] transition"
                      >
                        Save
                      </button>
                    </>
                  )}
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
                        e.target.value = "";
                        if (!file) return;
                        await uploadResume(file);
                      }}
                    />
                  </label>

                  {aiEnabled && (
                    <div className="mt-4 rounded-2xl border border-[rgb(242,200,168)] bg-[rgb(251,236,221)] px-4 py-3">
                      <div className="text-xs font-semibold text-[rgb(166,96,43)]">
                        AI follow-ups
                      </div>
                      <div className="mt-1 text-xs text-neutral-700">
                        {aiLeft} remaining
                      </div>
                    </div>
                  )}
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
                      <div className="text-sm font-semibold text-neutral-900">
                        {q}
                      </div>
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
                                prev.map((x, i) =>
                                  i === idx ? e.target.value : x
                                )
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
                <div className="rounded-2xl border border-[rgb(242,200,168)] bg-[rgb(251,236,221)] shadow-sm">
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
                      className="mt-3 w-full rounded-2xl border border-[rgb(242,200,168)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[rgb(242,200,168)] focus:ring-2 focus:ring-[rgb(251,236,221)]"
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
                  {shouldSubmit ? "Submit" : aiQuestion ? "Continue" : "Start follow-ups"}
                </button>
              </div>

              {aiEnabled && !aiQuestion && aiLeft > 0 && (
                <div className="text-xs text-neutral-500 px-1">
                  Click <span className="font-semibold">Start follow-ups</span> to
                  generate an AI question.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}