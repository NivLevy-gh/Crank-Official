import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

export default function PublicFormPage() {
  const navigate = useNavigate();
  const { shareToken } = useParams(); // <-- FIX

  const [crank, setCrank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");

  const [answers, setAnswers] = useState({});
  const [history, setHistory] = useState([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");

  const [resumeProfile, setResumeProfile] = useState(null);
  const [resumeUploading, setResumeUploading] = useState(false);

  const questions = useMemo(() => crank?.baseQuestions || [], [crank]);

  const aiEnabled = crank?.aiEnabled ?? true;
  const maxAiQuestions = crank?.maxAiQuestions ?? 2;

  const aiUsed = history.length;
  const aiLeft = Math.max(0, maxAiQuestions - aiUsed);

  const shouldSubmit = !aiEnabled || (aiLeft === 0 && !aiQuestion);

  // Load PUBLIC form (NO AUTH)
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
          setLoadErr(data?.error || `Failed to load form`);
          setLoading(false);
          return;
        }

        setCrank(data.form);
        setLoading(false);
      } catch (e) {
        console.log(e);
        setLoadErr("Failed to load form.");
        setLoading(false);
      }
    };

    loadForm();
  }, [shareToken]);

  // AI next (PUBLIC)
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
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/public/forms/${shareToken}/ai-next`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: crank.summary,
            history: combinedHistory,
            resumeProfile,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data?.error || "AI request failed");

      setAiQuestion(data.nextQuestion || "");
    } catch (err) {
      console.log(err);
      alert("AI request failed");
    }
  };

  // Submit (PUBLIC)
  const sendAnswers = async () => {
    if (!crank) return;

    const baseHistory = (crank.baseQuestions || []).map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    }));

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
      if (!res.ok) return alert(data?.error || "Failed to submit");

      alert("Submitted successfully!");
      navigate("/"); // or a thank-you page
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
      return;
    }

    await getNextAiQuestion();
  };

  // --- KEEP YOUR EXISTING JSX/UI BELOW ---
  if (loading) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="text-sm text-neutral-600">Loading…</div></div>;
  if (loadErr) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="text-sm text-red-600">{loadErr}</div></div>;
  if (!crank) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="text-sm text-neutral-600">Form not found</div></div>;

  return (
    // paste your existing UI here
    <div>...</div>
  );
}