import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "./supabaseClient";
import logo from "./assets/logo.png";

export default function ResponseDetail() {
  const { responseId } = useParams();
  const navigate = useNavigate();

  const [resp, setResp] = useState(null);
  const [formName, setFormName] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [summaryObj, setSummaryObj] = useState(null);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErr("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setErr("Not logged in.");
        setLoading(false);
        return;
      }

      const res = await fetch(`http://localhost:5001/responses/${responseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error || "Failed to load response");
        setLoading(false);
        return;
      }

      setResp(data.response);
      setFormName(data.formName || "");

      // if stored as json string
      if (data.response?.summary) {
        try {
          const parsed =
            typeof data.response.summary === "string"
              ? JSON.parse(data.response.summary)
              : data.response.summary;
          setSummaryObj(parsed);
        } catch {}
      }

      setLoading(false);
    };

    run();
  }, [responseId]);

  const generateSummary = async () => {
    setSummarizing(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch(`http://localhost:5001/responses/${responseId}/summarize`, {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

    const data = await res.json().catch(() => ({}));
    setSummarizing(false);

    if (!res.ok) return alert(data?.error || "Failed to summarize");

    const s = data.summary;
    setSummaryObj(typeof s === "string" ? JSON.parse(s) : s);
  };

  if (loading) return <div className="min-h-screen bg-neutral-900/98 text-white p-6">Loading…</div>;
  if (err) return <div className="min-h-screen bg-neutral-900/98 text-white p-6">{err}</div>;
  if (!resp) return <div className="min-h-screen bg-neutral-900/98 text-white p-6">Not found.</div>;

  return (
    <div className="min-h-screen bg-neutral-900/98 text-white">
      <div className="border-b border-neutral-800 px-6 py-4 flex items-center">
        <img
          src={logo}
          className="w-28 h-8 cursor-pointer"
          alt="logo"
          onClick={() => navigate("/dashboard")}
        />
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-neutral-400">{formName}</div>
            <h1 className="text-2xl font-semibold">Response</h1>
            <div className="mt-1 text-xs text-neutral-400">
              {new Date(resp.created_at).toLocaleString()}
            </div>
          </div>

          <button
            className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm"
            onClick={() => navigate(`/results/${resp.formid}`)}
          >
            Back to results
          </button>
        </div>

        <div className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">AI summary</h2>
            <button
              onClick={generateSummary}
              disabled={summarizing}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
            >
              {summaryObj ? "Refresh" : summarizing ? "Generating…" : "Generate"}
            </button>
          </div>

          {!summaryObj ? (
            <div className="mt-3 text-sm text-neutral-400">
              Generate a quick readout (strengths/risks/next step).
            </div>
          ) : (
            <div className="mt-4 text-sm">
              <div className="font-medium">{summaryObj.one_liner}</div>

              <div className="mt-4">
                <div className="text-xs text-neutral-400">Strengths</div>
                <ul className="mt-2 list-disc pl-5">
                  {(summaryObj.strengths || []).map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>

              <div className="mt-4">
                <div className="text-xs text-neutral-400">Risks</div>
                <ul className="mt-2 list-disc pl-5">
                  {(summaryObj.risks || []).map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>

              <div className="mt-4">
                <div className="text-xs text-neutral-400">Recommended next step</div>
                <div className="mt-2">{summaryObj.recommended_next_step}</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-lg font-semibold">Answers</h2>

          <div className="mt-4 flex flex-col gap-3">
            {(resp.answers || []).map((qa, i) => (
              <div key={i} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-400">Question</div>
                <div className="mt-1 text-sm">{qa.question}</div>
                <div className="mt-3 text-xs text-neutral-400">Answer</div>
                <div className="mt-1 text-sm whitespace-pre-wrap">{qa.answer}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}