import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import logo from "./assets/logo.png";
import Navbar from "./Navbar";

function Card({ title, subtitle, children }) {
  return (
    <div className="w-full rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4">
      <div>
        <div className="text-sm font-medium text-neutral-900">{label}</div>
        {description && <div className="mt-1 text-sm text-neutral-500">{description}</div>}
      </div>

      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full border transition ${
          checked ? "bg-orange-200 border-orange-200" : "bg-neutral-100 border-neutral-200"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full shadow-sm transition ${
            checked ? "left-6 bg-white" : "left-1 bg-white"
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
      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to submit form.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
    <Navbar />
        
    {/* page content */}
 
      {/* Top bar */}
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6">
          <div className="flex">
          <h1 className="text-2xl font-semibold text-neutral-900">Create a form</h1>
          <button
            onClick={() => navigate("/dashboard")}
            className="h-9 ml-auto rounded-xl px-3 text-xs font-medium border border-neutral-200 bg-white text-neutral-900 shadow-sm transition hover:bg-neutral-50 hover:border-neutral-300 active:scale-[0.99]"
          >
            Back
          </button>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Keep it clean. Let the AI do the heavy lifting.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Card title="Form setup">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Form name"
              className="
                w-full rounded-2xl border border-neutral-200 bg-white
                px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400
                shadow-sm transition
                focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100
              "
              required
            />

            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What is this form for?"
              className="
                mt-4 w-full rounded-2xl border border-neutral-200 bg-white
                px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400
                shadow-sm transition
                focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100
              "
              rows={3}
              required
            />
          </Card>

          <Card
            title="Adaptive interview questions"
            subtitle="AI can ask a small number of follow-ups based on responses."
          >
            <Toggle
              checked={aiEnabled}
              onChange={setAiEnabled}
              label="Enable AI follow-up questions"
              description="Keeps the form short, but still deep."
            />

            {aiEnabled && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Max follow-up questions
                </label>

                <div className="relative">
                  <input
                    value={maxAiQuestions}
                    type= "number"
                    onChange={(e) => setMaxAiQuestions(Number(e.target.value))}
                    className="
                      w-full appearance-none rounded-xl border border-neutral-200 bg-white
                      px-4 py-2.5 text-sm text-neutral-900
                      shadow-sm transition
                      focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100
                    "
                  />
                    
                  

                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                    ▾
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card title="Starter questions" subtitle="These are always asked first.">
            <div className="flex flex-col gap-3">
              {baseQuestions.map((q, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm"
                >
                  <span className="text-sm text-neutral-900">{q}</span>
                  <button
                    type="button"
                    onClick={() => removeBaseQuestion(i)}
                    className="text-xs font-medium text-neutral-500 hover:text-neutral-900 transition"
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
                  className="
                    flex-1 rounded-2xl border border-neutral-200 bg-white
                    px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400
                    shadow-sm transition
                    focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100
                  "
                />
                <button
                  type="button"
                  onClick={addBaseQuestion}
                  className="
                    rounded-2xl border border-neutral-200 bg-white
                    px-4 py-3 text-sm font-medium text-neutral-900
                    shadow-sm transition
                    hover:border-orange-200 hover:bg-orange-50
                    active:scale-[0.99]
                  "
                >
                  Add
                </button>
              </div>
            </div>
          </Card>

          {errorMsg && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="
              h-11 w-full rounded-xl
              bg-orange-200 text-neutral-900 text-sm font-medium
              border border-orange-200
              shadow-sm transition
              hover:bg-orange-300 hover:shadow
              disabled:opacity-60 disabled:cursor-not-allowed
              active:scale-[0.99]
            "
          >
            {saving ? "Saving..." : "Save & Publish"}
          </button>
        </form>
      </div>
    </div>
  );
}