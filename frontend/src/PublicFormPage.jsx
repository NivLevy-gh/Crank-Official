import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Lightweight toast (replaces alert()).
 * No dimmed background, no focus/tab weirdness.
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
      <div className={`rounded-lg border px-4 py-3 shadow-lg ${styles}`}>
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

export default function PublicFormPage() {
  const navigate = useNavigate();
  const { shareToken } = useParams();

  const [crank, setCrank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");

  const [answers, setAnswers] = useState({});
  const [history, setHistory] = useState([]); // AI Q/A only
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");

  const [resumeProfile, setResumeProfile] = useState(null);
  const [resumeUploading, setResumeUploading] = useState(false);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const notify = (type, title, message) => {
    setToast({ type, title, message });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  };

  const questions = useMemo(() => crank?.baseQuestions || [], [crank]);

  const aiEnabled = crank?.aiEnabled ?? true;
  const maxAiQuestions = crank?.maxAiQuestions ?? 2;

  const aiUsed = history.length;
  const aiLeft = Math.max(0, (maxAiQuestions ?? 0) - aiUsed);

  // Submit when:
  // - AI disabled OR
  // - used all followups AND no current question displayed
  const shouldSubmit = !aiEnabled || (aiLeft === 0 && !aiQuestion);

  // -------------------------
  // Load PUBLIC form (no auth)
  // -------------------------
  useEffect(() => {
    const loadForm = async () => {
      try {
        setLoading(true);
        setLoadErr("");

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/public/forms/${shareToken}`
        );

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
        setLoading(false);
      } catch (e) {
        console.log(e);
        setLoadErr("Failed to load form.");
        setLoading(false);
      }
    };

    loadForm();
  }, [shareToken]);

  // -------------------------
  // Resume upload (PUBLIC)
  // -------------------------
  const uploadResume = async (file) => {
    if (!file) return;

    if (file.type !== "application/pdf") {
      notify("error", "Invalid file", "Please upload a PDF.");
      return;
    }

    try {
      setResumeUploading(true);

      const formData = new FormData();
      formData.append("resume", file);

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/public/forms/${shareToken}/resume`,
        { method: "POST", body: formData }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        notify("error", "Resume failed", data?.error || "Resume upload failed.");
        return;
      }

      setResumeProfile(data.resumeProfile);
      notify("success", "Resume processed", "Resume is loaded and ready.");
    } catch (err) {
      console.log(err);
      notify("error", "Resume failed", "Resume upload failed.");
    } finally {
      setResumeUploading(false);
    }
  };

  // -------------------------
  // Build base Q/A snapshot
  // -------------------------
  const buildBaseHistory = () =>
    (crank?.baseQuestions || []).map((q, i) => ({
      question: q,
      answer: (answers[i] || "").trim(),
    }));

  // -------------------------
  // Fetch next AI question (PUBLIC)
  // IMPORTANT: accepts combinedHistory as input to avoid state timing issues
  // -------------------------
  const fetchNextAiQuestion = async (combinedHistory) => {
    if (!crank) return null;

    if (!aiEnabled) {
      notify("error", "AI off", "AI follow-ups are disabled for this form.");
      return null;
    }

    if (!resumeProfile) {
      notify("error", "Resume required", "Upload your resume to use AI follow-ups.");
      return null;
    }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/public/forms/${shareToken}/ai-next`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            history: combinedHistory,
            resumeProfile,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify("error", "AI failed", data?.error || "AI request failed.");
        return null;
      }

      return (data.nextQuestion || "").trim();
    } catch (err) {
      console.log(err);
      notify("error", "AI failed", "AI request failed.");
      return null;
    }
  };

  // -------------------------
  // Submit (PUBLIC)
  // -------------------------
  const sendAnswers = async () => {
    if (!crank) return;

    // Your backend currently requires resumeProfile for public submit.
    if (!resumeProfile) {
      notify("error", "Resume required", "Upload your resume before submitting.");
      return;
    }

    const baseHistory = buildBaseHistory();
    const fullHistory = [...baseHistory, ...history];

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/public/forms/${shareToken}/responses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: fullHistory, resumeProfile }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify("error", "Submit failed", data?.error || "Failed to submit.");
        return;
      }

      notify("success", "Submitted", "Thanks — your response was submitted.");
      window.setTimeout(() => navigate("/"), 600);
    } catch (e) {
      console.log(e);
      notify("error", "Submit failed", "Failed to submit.");
    }
  };

  // -------------------------
  // Primary button behavior (PUBLIC)
  // - No more "Answer current AI question first" blocking.
  // - If AI question showing: save answer + maybe fetch next.
  // - If none showing: fetch first follow-up.
  // - When done: submit.
  // -------------------------
  const handlePrimary = async () => {
    if (!crank) return;

    // If we're done with follow-ups, submit
    if (shouldSubmit) {
      await sendAnswers();
      return;
    }

    // Resume required (matches backend behavior)
    if (!resumeProfile) {
      notify("error", "Resume required", "Upload your resume to continue.");
      return;
    }

    const baseHistory = buildBaseHistory();

    // If AI question is displayed, save it
    if (aiQuestion) {
      const trimmed = (aiAnswer || "").trim();
      if (!trimmed) {
        notify("error", "Missing answer", "Type an answer for the AI follow-up.");
        return;
      }

      const newItem = { question: aiQuestion, answer: trimmed };
      const nextHistory = [...history, newItem];
      const combinedHistory = [...baseHistory, ...nextHistory];

      // Clear UI immediately
      setHistory(nextHistory);
      setAiQuestion("");
      setAiAnswer("");

      // If that was the last slot, stop. Next click becomes Submit.
      if (nextHistory.length >= maxAiQuestions) {
        notify("success", "Saved", "AI follow-up saved. You can submit now.");
        return;
      }

      // Otherwise fetch the next question using combinedHistory
      const nextQ = await fetchNextAiQuestion(combinedHistory);
      if (nextQ) setAiQuestion(nextQ);
      return;
    }

    // No AI question yet: fetch first follow-up
    const combinedHistory = [...baseHistory, ...history];
    const nextQ = await fetchNextAiQuestion(combinedHistory);
    if (nextQ) setAiQuestion(nextQ);
  };

  // -------------------------
  // Render guards
  // -------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-sm text-neutral-600">Loading…</div>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadErr}
        </div>
      </div>
    );
  }

  if (!crank) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-sm text-neutral-600">Form not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f5f1]">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* subtle top gradient */}
      <div className="h-36 w-full bg-[#f7f5f1]" />

      <div className="-mt-16 pb-16">
        <div className="mx-auto w-full max-w-4xl px-4">
          {/* Top card */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="h-1.5 bg-[rgb(242,200,168)]" />

            <div className="p-6 sm:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900">
                    {crank.name}
                  </h1>
                  <p className="mt-2 text-sm sm:text-[15px] leading-relaxed text-neutral-600">
                    {crank.summary}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-lg bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                      AI: {aiEnabled ? "On" : "Off"}
                    </span>

                    {aiEnabled && (
                      <span className="rounded-lg bg-[rgb(251,236,221)] px-3 py-1 text-xs font-medium text-[rgb(166,96,43)]">
                        Follow-ups: {aiUsed}/{maxAiQuestions}
                      </span>
                    )}

                    <span className="rounded-lg bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      Public
                    </span>
                  </div>
                </div>

                {/* Right actions (optional) */}
              </div>
            </div>
          </div>

          {/* Resume + Questions */}
          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Left column */}
            <div className="lg:col-span-1 space-y-5">
              <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
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
                      <span className="rounded-lg bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                        ✓ Loaded
                      </span>
                    ) : (
                      <span className="rounded-lg bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                        Required
                      </span>
                    )}
                  </div>

                  <label className="mt-4 flex cursor-pointer items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm transition hover:border-[rgb(242,200,168)] hover:bg-[rgb(251,236,221)]">
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
                    <div className="mt-4 rounded-lg border border-[rgb(242,200,168)] bg-[rgb(251,236,221)] px-4 py-3">
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

            {/* Right column: base questions + AI follow-up */}
            <div className="lg:col-span-2 space-y-4">
              {questions.map((q, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-neutral-200 bg-white shadow-sm"
                >
                  <div className="p-6">
                    <div className="text-sm font-semibold text-neutral-900">
                      {q}
                    </div>
                    <textarea
                      className="mt-3 w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[rgb(242,200,168)] focus:ring-2 focus:ring-[rgb(251,236,221)]"
                      rows={4}
                      placeholder="Your answer"
                      value={answers[i] || ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                      }
                    />
                  </div>
                </div>
              ))}

              {aiEnabled && aiQuestion && (
                <div className="rounded-xl border border-[rgb(242,200,168)] bg-[rgb(251,236,221)] shadow-sm">
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
                      className="mt-3 w-full rounded-lg border border-[rgb(242,200,168)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[rgb(222,150,90)] focus:ring-2 focus:ring-[rgb(251,236,221)]"
                      rows={4}
                      placeholder="Your answer"
                      value={aiAnswer}
                      onChange={(e) => setAiAnswer(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handlePrimary}
                  className="h-10 rounded-md px-5 text-sm font-semibold bg-[rgb(242,200,168)] text-neutral-900 hover:bg-[rgb(235,185,150)] transition shadow-sm"
                >
                  {shouldSubmit ? "Submit" : aiQuestion ? "Continue" : "Start follow-ups"}
                </button>
              </div>

              {aiEnabled && !aiQuestion && aiLeft > 0 && (
                <div className="text-xs text-neutral-500 px-1">
                  Click <span className="font-semibold">Start follow-ups</span> to generate an AI question.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}