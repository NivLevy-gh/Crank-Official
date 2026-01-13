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

        const res = await fetch(`http://localhost:5001/responses/${responseId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErr(data?.error || "Failed to load response");
          setLoading(false);
          return;
        }

        setResponse(data.response);
        setFormName(data.formName);
        
        // Set summary if it exists
        if (data.response?.summary) {
          const s = typeof data.response.summary === "string" 
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
      `http://localhost:5001/responses/${responseId}/summarize`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    const data = await res.json().catch(() => ({}));
    setSummarizing(false);
    
    if (!res.ok) return alert(data?.error || "Failed to summarize");
    
    const s = data.summary;
    setSummaryObj(typeof s === "string" ? JSON.parse(s) : s);
  };

  if (loading) return <div className="min-h-screen bg-white p-6 text-sm text-neutral-600">Loading…</div>;
  if (err) return <div className="min-h-screen bg-white p-6 text-sm text-red-600">{err}</div>;
  if (!response) return <div className="min-h-screen bg-white p-6 text-sm text-neutral-600">Response not found.</div>;

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="text-xs font-medium text-neutral-500">Response Detail</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
              {formName}
            </h1>
            <div className="mt-1 text-sm text-neutral-500">
              {new Date(response.created_at).toLocaleString()}
            </div>
          </div>

          <button
            onClick={() => navigate(-1)}
            className="h-9 rounded-xl px-3 text-xs font-medium border border-neutral-200 bg-white text-neutral-900 shadow-sm transition hover:bg-neutral-50 hover:border-neutral-300 active:scale-[0.99]"
          >
            Back
          </button>
        </div>

        {/* Summary */}
        {summaryObj && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">AI Summary</h2>
            </div>
            
            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-neutral-500">Candidate</div>
                <div className="text-sm text-neutral-900">{summaryObj.candidate_name}</div>
              </div>
              
              <div>
                <div className="text-xs font-medium text-neutral-500">One-liner</div>
                <div className="text-sm text-neutral-900">{summaryObj.one_liner}</div>
              </div>
              
              {summaryObj.strengths?.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-neutral-500">Strengths</div>
                  <ul className="mt-1 space-y-1">
                    {summaryObj.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-neutral-900">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {summaryObj.risks?.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-neutral-500">Risks</div>
                  <ul className="mt-1 space-y-1">
                    {summaryObj.risks.map((r, i) => (
                      <li key={i} className="text-sm text-neutral-900">• {r}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div>
                <div className="text-xs font-medium text-neutral-500">Recommended Next Step</div>
                <div className="text-sm text-neutral-900">{summaryObj.recommended_next_step}</div>
              </div>
            </div>
          </div>
        )}

        {!summaryObj && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm mb-6">
            <button
              onClick={generateSummary}
              disabled={summarizing}
              className="h-9 rounded-xl px-3 text-xs font-medium bg-orange-100 text-neutral-900 border border-orange-100 hover:bg-orange-200 transition disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
            >
              {summarizing ? "Generating…" : "Generate AI Summary"}
            </button>
          </div>
        )}

        {/* Q&A */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-4">Answers</h2>
          
          <div className="space-y-4">
            {(response.answers || []).map((qa, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs font-medium text-neutral-500 mb-2">
                  Q{i + 1}: {qa.question}
                </div>
                <div className="text-sm text-neutral-900">
                  {qa.answer || <span className="text-neutral-400">No answer</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}