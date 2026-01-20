import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Navbar from "./Navbar";

export default function ResponseDetail() {
  const { responseId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [response, setResponse] = useState(null);
  const [formName, setFormName] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryObj, setSummaryObj] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setErr("");

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        if (!token) {
          setErr("Not logged in.");
          setLoading(false);
          return;
        }

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/responses/${responseId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErr(data?.error || "Failed to load response");
          setLoading(false);
          return;
        }

        setResponse(data.response);
        setFormName(data.formName);

        if (data.response?.summary) {
          const s =
            typeof data.response.summary === "string"
              ? JSON.parse(data.response.summary)
              : data.response.summary;
          setSummaryObj(s);
        }

        setLoading(false);
      } catch (e) {
        console.log(e);
        setErr("Failed to load response");
        setLoading(false);
      }
    };

    load();
  }, [responseId]);

  const generateSummary = async () => {
    setSummarizing(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch(
      `${import.meta.env.VITE_API_URL}/responses/${responseId}/summarize`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const data = await res.json().catch(() => ({}));
    setSummarizing(false);

    if (!res.ok) return alert(data?.error || "Failed to summarize");

    const s = data.summary;
    setSummaryObj(typeof s === "string" ? JSON.parse(s) : s);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[rgb(253,249,244)] flex items-center justify-center">
        <div className="text-sm text-neutral-600">Loading…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-[rgb(253,249,244)] flex items-center justify-center px-6">
        <div className="text-sm text-red-600">{err}</div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="min-h-screen bg-[rgb(253,249,244)] flex items-center justify-center">
        <div className="text-sm text-neutral-600">Response not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(253,249,244)]">
      <Navbar />

      {/* subtle top gradient */}
      <div className="h-28 w-full bg-gradient-to-b from-[rgb(250,232,217)] to-[rgb(253,249,244)]" />

      <div className="-mt-14 pb-16">
        <div className="mx-auto max-w-4xl px-4">
          {/* Header card */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden mb-6">
            <div className="h-1.5 bg-[rgb(242,200,168)]" />
            <div className="p-6 sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-neutral-500">
                    Response detail
                  </div>
                  <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900 truncate">
                    {formName}
                  </h1>
                  <div className="mt-2 text-sm text-neutral-500">
                    {new Date(response.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex gap-2 sm:justify-end">
                  <button
                    onClick={() => navigate(-1)}
                    className="h-10 rounded-md px-4 text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Summary */}
          {summaryObj ? (
            <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden mb-6">
              <div className="h-1.5 bg-[rgb(242,200,168)]" />
              <div className="p-6 sm:p-7">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-neutral-900">
                    AI Summary
                  </h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-medium text-neutral-500">
                      Candidate
                    </div>
                    <div className="text-sm text-neutral-900">
                      {summaryObj.candidate_name || "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-neutral-500">
                      One-liner
                    </div>
                    <div className="text-sm text-neutral-900">
                      {summaryObj.one_liner || "—"}
                    </div>
                  </div>

                  {summaryObj.strengths?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-neutral-500">
                        Strengths
                      </div>
                      <ul className="mt-2 space-y-1">
                        {summaryObj.strengths.map((s, i) => (
                          <li key={i} className="text-sm text-neutral-900">
                            • {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summaryObj.risks?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-neutral-500">
                        Risks
                      </div>
                      <ul className="mt-2 space-y-1">
                        {summaryObj.risks.map((r, i) => (
                          <li key={i} className="text-sm text-neutral-900">
                            • {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-medium text-neutral-500">
                      Recommended next step
                    </div>
                    <div className="text-sm text-neutral-900">
                      {summaryObj.recommended_next_step || "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-white shadow-sm mb-6">
              <div className="p-6 sm:p-7">
                <button
                  onClick={generateSummary}
                  disabled={summarizing}
                  className="h-10 rounded-md px-4 text-sm font-semibold
                    bg-[rgb(251,236,221)] text-[rgb(166,96,43)]
                    border border-[rgb(242,200,168)]
                    hover:bg-[rgb(247,225,205)]
                    transition disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
                >
                  {summarizing ? "Generating…" : "Generate AI Summary"}
                </button>
              </div>
            </div>
          )}

          {/* Answers */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="p-6 sm:p-7">
              <h2 className="text-sm font-semibold text-neutral-900 mb-4">
                Answers
              </h2>

              <div className="space-y-4">
                {(response.answers || []).map((qa, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-neutral-200 bg-[rgb(253,249,244)] p-4"
                  >
                    <div className="text-xs font-medium text-neutral-600 mb-2">
                      Q{i + 1}: {qa.question}
                    </div>

                    <div className="text-sm text-neutral-900 leading-relaxed whitespace-pre-wrap">
                      {qa.answer ? (
                        qa.answer
                      ) : (
                        <span className="text-neutral-400">No answer</span>
                      )}
                    </div>
                  </div>
                ))}

                {(response.answers || []).length === 0 && (
                  <div className="text-sm text-neutral-500">No answers saved.</div>
                )}
              </div>
            </div>
          </div>

          {/* bottom spacing */}
          <div className="h-10" />
        </div>
      </div>
    </div>
  );
}