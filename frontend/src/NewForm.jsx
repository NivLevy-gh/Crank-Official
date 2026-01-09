import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import logo from "./assets/logo.png";

function Card({ title, subtitle, children }) {
  return (
    <div className="w-full rounded-3xl border border-neutral-800 bg-neutral-800 p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/98 p-4">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        {description && (
          <div className="mt-1 text-sm text-neutral-400">{description}</div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition ${
          checked ? "bg-white" : "bg-neutral-800"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full transition ${
            checked ? "left-6 bg-black" : "left-1 bg-white"
          }`}
        />
      </button>
    </div>
  );
}

export default function Form() {
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = async () => {
      const result = await supabase.auth.getUser();
      if (!result.data.user) navigate("/login");
    };
    checkUser();
  }, [navigate]);

  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");

  const [aiEnabled, setAiEnabled] = useState(true);
  const [maxAiQuestions, setMaxAiQuestions] = useState(2);

  const [baseQuestions, setBaseQuestions] = useState([
    "Full name",
    "Email",
    "Upload your resume (PDF)",
    "Tell us a bit about your background.",
  ]);
  const [newQuestion, setNewQuestion] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const addBaseQuestion = () => {
    if (!newQuestion.trim()) return;
    setBaseQuestions((prev) => [...prev, newQuestion.trim()]);
    setNewQuestion("");
  };

  const removeBaseQuestion = (index) => {
    setBaseQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSaving(true);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    try {
      const res = await fetch("http://localhost:5001/forms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          summary,
          baseQuestions,
          aiEnabled,
          maxAiQuestions,
        }),
      });

      if (!res.ok) throw new Error("Failed to submit");

      alert("Form submitted!");
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to submit form.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900/98 text-white">

      {/* Top bar */}
      <div className="border-b border-neutral-800 px-6 py-4 flex items-center">
        <img src={logo} className="w-28 h-8" />
        <div className="ml-auto w-10 h-10 border border-neutral-700 rounded-full" />
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold mb-6">Create a form</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Card title="Form setup" >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Form name"
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900/98 px-4 py-3 text-sm"
              required
            />

            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What is this form for?"
              className="mt-4 w-full rounded-2xl border border-neutral-800 bg-neutral-900/98 px-4 py-3 text-sm"
              rows={3}
              required
            />
          </Card>

          <Card
            title="Adaptive interview questions"
            subtitle="AI can ask a small number of questions based on responses."
          >
            <Toggle
              checked={aiEnabled}
              onChange={setAiEnabled}
              label="Enable AI follow-up questions"
            />

            {aiEnabled && (
              <div className="mt-4">
                <label className="block text-sm mb-1">
                  Max follow-up questions
                </label>
                <select
                  value={maxAiQuestions}
                  onChange={(e) => setMaxAiQuestions(Number(e.target.value))}
                  className="w-full rounded-xl border bg-neutral-900/98 px-4 appearance-none py-2"
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Card>

          <Card
            title="Starter questions"
            subtitle="These are always asked first."
          >
            <div className="flex flex-col gap-3">
              {baseQuestions.map((q, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900/98 px-4 py-3"
                >
                  <span className="text-sm">{q}</span>
                  <button
                    type="button"
                    onClick={() => removeBaseQuestion(i)}
                    className="text-xs text-neutral-400 hover:text-white"
                  >
                    Remove
                  </button>
                </div>
              ))}

              <div className="flex gap-2">
                <input
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="Add a base question"
                  className="flex-1 bg-neutral-900/98 rounded-2xl border border-neutral-800 px-4 py-3 text-sm"
                />
                <button
                  type="button"
                  onClick={addBaseQuestion}
                  className="rounded-2xl border border-neutral-800 bg-neutral-900/98 px-4 py-3 text-sm"
                >
                  Add
                </button>
              </div>
            </div>
          </Card>

          {errorMsg && (
            <div className="rounded-2xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-white px-6 py-3 text-sm font-medium text-black"
          >
            {saving ? "Submitting..." : "Save & Publish"}
          </button>
        </form>
      </div>
    </div>
  );
}
