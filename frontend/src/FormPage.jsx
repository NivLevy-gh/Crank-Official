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

  const [resumeProfile, setResumeProfile] = useState(null);
  const [resumeUploading, setResumeUploading] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editQuestions, setEditQuestions] = useState([]);

  // ---------- button system ----------
  const btn = {
    primary:
      "inline-flex items-center justify-center h-9 px-3.5 rounded-lg text-sm font-semibold bg-[rgb(242,200,168)] text-neutral-900 hover:bg-[rgb(235,185,150)] transition shadow-sm",
    secondary:
      "inline-flex items-center justify-center h-9 px-3.5 rounded-lg text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition",
    ghost:
      "inline-flex items-center justify-center h-9 px-3.5 rounded-lg text-sm font-semibold text-neutral-700 hover:bg-neutral-100 transition",
    chip:
      "inline-flex items-center justify-center h-8 px-3 rounded-full text-xs font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition",
  };

  // ---------- derived ----------
  const questions = useMemo(() => crank?.baseQuestions || [], [crank]);
  const aiEnabled = crank?.aiEnabled ?? true;
  const maxAiQuestions = crank?.maxAiQuestions ?? 2;
  const aiUsed = history.length;
  const aiLeft = Math.max(0, maxAiQuestions - aiUsed);
  const shouldSubmit = !aiEnabled || (aiLeft === 0 && !aiQuestion);

  const publicUrl = useMemo(() => {
    if (!crank?.share_token) return "";
    return `${window.location.origin}/f/${crank.share_token}`;
  }, [crank]);

  // ---------- load form ----------
  useEffect(() => {
    const loadForm = async () => {
      try {
        setLoading(true);
        setLoadErr("");

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return setLoadErr("Not logged in.");

        const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        if (!res.ok) return setLoadErr(data.error || "Failed to load");

        setCrank(data.form);
        setEditName(data.form.name);
        setEditSummary(data.form.summary);
        setEditQuestions(data.form.baseQuestions);
        setLoading(false);
      } catch {
        setLoadErr("Failed to load form");
      }
    };

    loadForm();
  }, [id]);

  // ---------- save edits ----------
  const saveEdits = async () => {
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

    if (!res.ok) return alert("Failed to save");

    setCrank((prev) => ({
      ...prev,
      name: editName,
      summary: editSummary,
      baseQuestions: editQuestions,
    }));

    setEditMode(false);
  };

  // ---------- AI ----------
  const getNextAiQuestion = async () => {
    const baseHistory = questions.map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    }));

    const res = await fetch(
      `${import.meta.env.VITE_API_URL}/forms/${id}/ai-next`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: crank.summary,
          history: [...baseHistory, ...history],
          resumeProfile,
        }),
      }
    );

    const data = await res.json();
    if (res.ok) setAiQuestion(data.nextQuestion);
  };

  const handlePrimary = async () => {
    if (shouldSubmit) return alert("Submit not wired here");
    if (!aiQuestion) return getNextAiQuestion();

    setHistory((h) => [...h, { question: aiQuestion, answer: aiAnswer }]);
    setAiQuestion("");
    setAiAnswer("");
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-sm">
        Loading…
      </div>
    );

  if (loadErr)
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-red-600">
        {loadErr}
      </div>
    );

  return (
    <div className="min-h-screen bg-[rgb(253,249,244)]">
      <div className="h-32 bg-gradient-to-b from-[rgb(250,232,217)] to-transparent" />

      <div className="-mt-16 mx-auto max-w-4xl px-4 pb-16">
        {/* Header */}
        <div className="rounded-3xl bg-white border shadow-sm">
          <div className="h-1 bg-[rgb(242,200,168)]" />
          <div className="p-6 flex flex-col gap-4 sm:flex-row sm:justify-between">
            <div className="flex-1">
              {!editMode ? (
                <>
                  <h1 className="text-2xl font-semibold">{crank.name}</h1>
                  <p className="mt-2 text-sm text-neutral-600">
                    {crank.summary}
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
                  <textarea
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <span className={btn.chip}>
                  AI {aiEnabled ? "On" : "Off"}
                </span>
                <span className={btn.chip}>
                  {aiUsed}/{maxAiQuestions} follow-ups
                </span>
                <span className={btn.chip}>
                  {crank.public ? "Public" : "Private"}
                </span>
              </div>
            </div>

            {/* actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/form/${id}/results`)}
                className={btn.secondary}
              >
                Responses
              </button>

              <button
                onClick={async () => {
                  const { data } = await supabase.auth.getSession();
                  const token = data.session?.access_token;
                  if (!token) return;

                  const next = !crank.public;
                  setCrank((c) => ({ ...c, public: next }));

                  const res = await fetch(
                    `${import.meta.env.VITE_API_URL}/forms/${crank.ID}`,
                    {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({ public: next }),
                    }
                  );

                  if (!res.ok)
                    setCrank((c) => ({ ...c, public: !next }));
                }}
                className={btn.chip}
              >
                {crank.public ? "Make Private" : "Make Public"}
              </button>

              {!editMode ? (
                <button
                  onClick={() => setEditMode(true)}
                  className={btn.secondary}
                >
                  Edit
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setEditMode(false)}
                    className={btn.ghost}
                  >
                    Cancel
                  </button>
                  <button onClick={saveEdits} className={btn.primary}>
                    Save
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="mt-6 space-y-4">
          {questions.map((q, i) => (
            <div key={i} className="rounded-2xl bg-white border p-5">
              <div className="text-sm font-medium">{q}</div>
              <textarea
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                rows={4}
                value={answers[i] || ""}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [i]: e.target.value }))
                }
              />
            </div>
          ))}

          {aiQuestion && (
            <div className="rounded-2xl bg-[rgb(251,236,221)] border p-5">
              <div className="text-sm font-semibold">{aiQuestion}</div>
              <textarea
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                rows={4}
                value={aiAnswer}
                onChange={(e) => setAiAnswer(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button onClick={() => navigate("/dashboard")} className={btn.ghost}>
              Exit
            </button>
            <button onClick={handlePrimary} className={btn.primary}>
              {shouldSubmit ? "Submit" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}