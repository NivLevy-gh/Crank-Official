// FormPage.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import ShareModal from "./ShareModal";

/**
 * Minimal toast (no alert())
 */
function Toast({ toast, onClose }) {
  if (!toast) return null;

  const styles =
    toast.type === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : toast.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-neutral-200 bg-white text-neutral-900";

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
        {toast.message && <div className="mt-1 text-sm opacity-90">{toast.message}</div>}
      </div>
    </div>
  );
}

function Pill({ children, tone = "neutral" }) {
  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border";
  const tones = {
    neutral: "bg-neutral-50 text-neutral-700 border-neutral-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-900 border-amber-200",
  };
  return <span className={`${base} ${tones[tone] || tones.neutral}`}>{children}</span>;
}

function SectionTitle({ title, subtitle }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold text-neutral-900">{title}</div>
      {subtitle ? <div className="mt-0.5 text-xs text-neutral-500">{subtitle}</div> : null}
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
  const [editAiEnabled, setEditAiEnabled] = useState(true);
  const [editMaxAi, setEditMaxAi] = useState(2);

  // UI state
  const [saving, setSaving] = useState(false);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [primaryBusy, setPrimaryBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const notify = (type, title, message) => {
    setToast({ type, title, message });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  };

  const questions = useMemo(() => crank?.baseQuestions || [], [crank]);

  const aiUsed = history.length;
  const aiLeft = Math.max(0, (maxAiQuestions ?? 0) - aiUsed);
  const shouldSubmit = !aiEnabled || aiLeft === 0;

  const publicUrl = useMemo(() => {
    if (!crank?.share_token) return "";
    return `${window.location.origin}/f/${crank.share_token}`;
  }, [crank]);

  // -------------------------
  // Load form
  // -------------------------
  useEffect(() => {
    const loadForm = async () => {
      try {
        setLoading(true);
        setLoadErr("");

        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
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
        setEditAiEnabled(form?.aiEnabled ?? true);
        setEditMaxAi(form?.maxAiQuestions ?? 2);

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

    const cleanMax = Math.max(0, Math.min(20, Number(editMaxAi || 0)));

    try {
      setSaving(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        notify("error", "Not logged in", "Please log in again.");
        setSaving(false);
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
          baseQuestions: editQuestions.filter((q) => (q || "").trim().length > 0),
          aiEnabled: !!editAiEnabled,
          maxAiQuestions: cleanMax,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify("error", "Save failed", data?.error || "Failed to save changes.");
        setSaving(false);
        return;
      }

      // reflect locally
      setCrank((prev) => ({
        ...prev,
        name: editName,
        summary: editSummary,
        baseQuestions: editQuestions.filter((q) => (q || "").trim().length > 0),
        aiEnabled: !!editAiEnabled,
        maxAiQuestions: cleanMax,
      }));

      setAiEnabled(!!editAiEnabled);
      setMaxAiQuestions(cleanMax);

      setEditMode(false);
      notify("success", "Saved", "Your form was updated.");
      setSaving(false);
    } catch (e) {
      console.log(e);
      notify("error", "Save failed", "Please try again.");
      setSaving(false);
    }
  };

  // -------------------------
  // Toggle public/private
  // -------------------------
  const togglePublic = async () => {
    if (!crank) return;

    try {
      setTogglingPublic(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        notify("error", "Not logged in", "Please log in again.");
        setTogglingPublic(false);
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

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCrank((prev) => ({ ...prev, public: !nextPublic }));
        notify("error", "Update failed", data?.error || "Could not change visibility.");
        setTogglingPublic(false);
        return;
      }

      notify(
        "success",
        "Updated",
        nextPublic ? "This form is now public." : "This form is now private."
      );
      setTogglingPublic(false);
    } catch (e) {
      console.log(e);
      notify("error", "Update failed", "Could not change visibility.");
      setTogglingPublic(false);
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

      const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}/resume`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify("error", "Resume failed", data?.error || "Resume upload failed.");
        setResumeUploading(false);
        return;
      }

      setResumeProfile(data.resumeProfile);
      notify("success", "Resume processed", "Resume is loaded and ready.");
      setResumeUploading(false);
    } catch (e) {
      console.log(e);
      setResumeUploading(false);
      notify("error", "Resume failed", "Resume upload failed.");
    }
  };

  // -------------------------
  // AI next question
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
  // Primary flow button
  // -------------------------
  const handlePrimary = async () => {
    if (!crank) return;

    if (!resumeProfile) {
      notify("error", "Resume required", "Upload your resume to continue.");
      return;
    }

    if (primaryBusy) return;

    try {
      setPrimaryBusy(true);

      // done with follow-ups -> submit
      if (shouldSubmit) {
        await sendAnswers();
        return;
      }

      const baseHistory = (crank.baseQuestions || []).map((q, i) => ({
        question: q,
        answer: (answers[i] || "").trim(),
      }));

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

      // no AI question yet -> start
      const combinedHistory = [...baseHistory, ...history];
      const nextQ = await fetchNextAiQuestion(combinedHistory);
      if (nextQ) setAiQuestion(nextQ);
    } finally {
      setPrimaryBusy(false);
    }
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
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadErr}
        </div>
      </div>
    );
  }

  if (!crank) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-sm text-neutral-600">Form not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} url={publicUrl} />

      {/* Top bar (Stripe/Notion-ish) */}
      <div className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
              >
                ← Dashboard
              </button>
              <div className="h-6 w-px bg-neutral-200" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-neutral-900">
                  {crank.name}
                </div>
                <div className="truncate text-xs text-neutral-500">
                  {crank.public ? "Public link enabled" : "Private form"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Pill tone={crank.public ? "green" : "neutral"}>
                {crank.public ? "Public" : "Private"}
              </Pill>
              <Pill tone={aiEnabled ? "blue" : "neutral"}>AI {aiEnabled ? "On" : "Off"}</Pill>
              {aiEnabled ? (
                <Pill tone="amber">
                  Follow-ups {aiUsed}/{maxAiQuestions}
                </Pill>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header card */}
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                {!editMode ? (
                  <>
                    <div className="text-xs font-medium text-neutral-500">Hiring form</div>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
                      {crank.name}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600">
                      {crank.summary}
                    </p>
                  </>
                ) : (
                  <div className="space-y-3">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      placeholder="Form title"
                    />
                    <textarea
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      rows={3}
                      placeholder="Form description"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-neutral-200 bg-white p-3">
                        <div className="text-xs font-medium text-neutral-600">AI follow-ups</div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm text-neutral-800">
                            <input
                              type="checkbox"
                              checked={!!editAiEnabled}
                              onChange={(e) => setEditAiEnabled(e.target.checked)}
                              className="h-4 w-4"
                            />
                            Enable AI
                          </label>
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-neutral-500">Max</div>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={editMaxAi}
                              onChange={(e) => setEditMaxAi(e.target.value)}
                              className="h-9 w-20 rounded-lg border border-neutral-200 bg-white px-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-neutral-200 bg-white p-3">
                        <div className="text-xs font-medium text-neutral-600">Visibility</div>
                        <div className="mt-2 text-sm text-neutral-800">
                          {crank.public ? "Public (shareable link)" : "Private (owner only)"}
                        </div>
                        <div className="mt-2 text-xs text-neutral-500">
                          You can still toggle visibility outside edit mode.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => navigate(`/form/${id}/results`)}
                  className="h-10 rounded-xl px-4 text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition"
                >
                  View responses
                </button>

                <button
                  type="button"
                  onClick={togglePublic}
                  disabled={togglingPublic}
                  className="h-10 rounded-xl px-4 text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition disabled:opacity-60"
                >
                  {togglingPublic ? "Updating…" : crank.public ? "Make private" : "Make public"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!publicUrl) {
                      notify("error", "No link", "This form has no share link.");
                      return;
                    }
                    setShareOpen(true);
                  }}
                  className="h-10 rounded-xl px-4 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
                >
                  Share
                </button>

                {!editMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditAiEnabled(aiEnabled);
                      setEditMaxAi(maxAiQuestions);
                      setEditMode(true);
                    }}
                    className="h-10 rounded-xl px-4 text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition"
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
                        setEditAiEnabled(crank?.aiEnabled ?? true);
                        setEditMaxAi(crank?.maxAiQuestions ?? 2);
                      }}
                      className="h-10 rounded-xl px-4 text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={saveEdits}
                      disabled={saving}
                      className="h-10 rounded-xl px-4 text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition disabled:opacity-60"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Share URL (read-only) */}
            <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-medium text-neutral-600">Share link</div>
                <div className="text-xs text-neutral-500">
                  Candidates can apply here (only if public)
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={publicUrl || "Make this form public to enable the share link."}
                  className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-800 outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!publicUrl) {
                      notify("error", "No link", "Make the form public first.");
                      return;
                    }
                    setShareOpen(true);
                  }}
                  className="h-10 rounded-xl px-3 text-sm font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 transition"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left column */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="p-6">
                <SectionTitle
                  title="Resume (required)"
                  subtitle="Upload a PDF so follow-ups can reference real details."
                />

                <div className="flex items-center justify-between">
                  {resumeProfile ? (
                    <Pill tone="green">✓ Loaded</Pill>
                  ) : (
                    <Pill tone="amber">Required</Pill>
                  )}

                  {aiEnabled ? (
                    <Pill tone="blue">{aiLeft} follow-ups left</Pill>
                  ) : (
                    <Pill tone="neutral">AI disabled</Pill>
                  )}
                </div>

                <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm transition hover:border-blue-200 hover:bg-blue-50">
                  <span className="font-semibold text-neutral-800">
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

                <div className="mt-4 text-xs text-neutral-500">
                  Tip: upload before starting follow-ups so the AI can ask deeper questions.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="p-6">
                <SectionTitle title="Progress" subtitle="What you’ve done so far." />
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-600">Base questions</span>
                    <span className="font-semibold text-neutral-900">{(crank.baseQuestions || []).length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-600">AI follow-ups answered</span>
                    <span className="font-semibold text-neutral-900">{aiUsed}</span>
                  </div>
                  <div className="h-px bg-neutral-200" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-600">Ready to submit</span>
                    <span className="font-semibold text-neutral-900">
                      {(!aiEnabled || aiLeft === 0) && resumeProfile ? "Yes" : "Not yet"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-8 space-y-4">
            {/* Questions */}
            {!editMode ? (
              questions.map((q, i) => (
                <div key={i} className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
                  <div className="p-6">
                    <div className="text-sm font-semibold text-neutral-900">
                      <span className="mr-2 text-xs font-medium text-neutral-500">
                        Q{i + 1}
                      </span>
                      {q}
                    </div>

                    <textarea
                      className="mt-3 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      rows={4}
                      placeholder="Write your answer…"
                      value={answers[i] || ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <div className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <SectionTitle
                      title="Edit base questions"
                      subtitle="These are the questions candidates see first."
                    />
                    <button
                      type="button"
                      onClick={() => setEditQuestions((prev) => [...prev, ""])}
                      className="h-9 rounded-xl px-3 text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition"
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
                          className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                          placeholder={`Question ${idx + 1}`}
                        />

                        <button
                          type="button"
                          onClick={() => setEditQuestions((prev) => prev.filter((_, i) => i !== idx))}
                          className="h-10 rounded-xl px-3 text-sm font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 transition"
                          aria-label="Remove question"
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
              <div className="rounded-2xl border border-blue-200 bg-blue-50 shadow-sm">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <Pill tone="blue">AI follow-up</Pill>
                    <div className="text-xs font-semibold text-blue-800">{aiLeft} left</div>
                  </div>

                  <div className="mt-3 text-sm font-semibold text-neutral-900">{aiQuestion}</div>

                  <textarea
                    className="mt-3 w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    rows={4}
                    placeholder="Answer this follow-up…"
                    value={aiAnswer}
                    onChange={(e) => setAiAnswer(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Bottom actions */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="h-10 rounded-xl px-4 text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition"
              >
                Exit
              </button>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {aiEnabled && !aiQuestion && aiLeft > 0 ? (
                  <div className="text-xs text-neutral-500 sm:mr-3">
                    Click <span className="font-semibold">Start follow-ups</span> to generate an AI question.
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handlePrimary}
                  disabled={primaryBusy}
                  className="h-10 rounded-xl px-5 text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition disabled:opacity-60"
                >
                  {primaryBusy
                    ? "Working…"
                    : shouldSubmit
                    ? "Submit"
                    : aiQuestion
                    ? "Continue"
                    : "Start follow-ups"}
                </button>
              </div>
            </div>

            {/* Empty state if no questions */}
            {questions.length === 0 && !editMode && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
                This form has no base questions yet. Click <span className="font-semibold">Edit</span> and add a few.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}