import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import logo from "./assets/logo.png";

export default function PublicFormPage() {
  const { shareToken } = useParams();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");

  const [answers, setAnswers] = useState({});
  const [history, setHistory] = useState([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");

  const [aiEnabled, setAiEnabled] = useState(true);
  const [maxAiQuestions, setMaxAiQuestions] = useState(2);

  const questions = useMemo(() => form?.baseQuestions || [], [form]);

  const aiUsed = history.length;
  const aiLeft = Math.max(0, maxAiQuestions - aiUsed);
  const shouldSubmit = !aiEnabled || (aiLeft === 0 && !aiQuestion);

  // -a------------------------
  // Load public form
  // -------------------------
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setLoadErr("");

        const res = await fetch(
          `http://localhost:5001/public/forms/${shareToken}`
        );
        const data = await res.json();

        if (!res.ok) {
          setLoadErr(data?.error || "Failed to load form");
          setLoading(false);
          return;
        }

        setForm(data.form);
        setAiEnabled(data.form?.aiEnabled ?? true);
        setMaxAiQuestions(data.form?.maxAiQuestions ?? 2);
        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoadErr("Failed to load form");
        setLoading(false);
      }
    };

    load();
  }, [shareToken]);

  // -------------------------
  // AI logic
  // -------------------------
  const getNextAiQuestion = async (extraHistory = null) => {
    if (!form || !aiEnabled || aiQuestion || aiLeft <= 0) return;

    const baseHistory = questions.map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    }));

    const combinedHistory = extraHistory ?? [...baseHistory, ...history];

    const res = await fetch(
      `http://localhost:5001/public/forms/${shareToken}/ai-next`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: combinedHistory,
          baseQuestions: form.baseQuestions,
          summary: form.summary,
        }),
      }
    );

    const data = await res.json();
    if (res.ok) setAiQuestion(data.nextQuestion || "");
  };

  const sendAnswers = async () => {
    const baseHistory = questions.map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    }));

    await fetch(
      `http://localhost:5001/public/forms/${shareToken}/responses`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: [...baseHistory, ...history],
        }),
      }
    );

    alert("Submitted");
  };

  const handlePrimary = async () => {
    if (shouldSubmit) return sendAnswers();

    if (aiQuestion) {
      const newItem = { question: aiQuestion, answer: aiAnswer.trim() };
      setHistory((h) => [...h, newItem]);
      setAiQuestion("");
      setAiAnswer("");

      if (aiUsed + 1 < maxAiQuestions) {
        const baseHistory = questions.map((q, i) => ({
          question: q,
          answer: answers[i] || "",
        }));
        getNextAiQuestion([...baseHistory, ...history, newItem]);
      }
      return;
    }

    getNextAiQuestion();
  };

  // -------------------------
  // Render
  // -------------------------
  if (loading) return <div className="p-6 text-sm">Loading…</div>;
  if (loadErr) return <div className="p-6 text-sm">{loadErr}</div>;
  if (!form) return <div className="p-6 text-sm">Form not found</div>;

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <img src={logo} alt="logo" className="h-6" />
      </div>

      <div className="mx-auto max-w-xl px-6 py-10">
        <h1 className="text-xl font-medium">{form.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">{form.summary}</p>

        {/* Base questions */}
        <div className="mt-8 space-y-5">
          {questions.map((q, i) => (
            <div key={i}>
              <div className="text-sm font-medium">{q}</div>
              <textarea
                className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
                rows={3}
                value={answers[i] || ""}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [i]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>

        {/* AI follow-up */}
        {aiEnabled && aiQuestion && (
          <div className="mt-8">
            <div className="text-sm font-medium">{aiQuestion}</div>
            <textarea
              className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
              rows={3}
              value={aiAnswer}
              onChange={(e) => setAiAnswer(e.target.value)}
            />
          </div>
        )}

        {/* Button */}
        <div className="mt-10 flex justify-end">
          <button
            onClick={handlePrimary}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 transition"
          >
            {shouldSubmit ? "Submit" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}