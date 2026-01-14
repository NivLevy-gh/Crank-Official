import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Navbar from "./Navbar";

function pickCandidateNameFromAnswers(answers = []) {
  const nameLike = answers.find((qa) =>
    (qa?.question || "").toLowerCase().includes("name")
  );
  const name = (nameLike?.answer || "").trim();
  return name || "Candidate";
}

function getOneLiner(r) {
  if (!r?.summary) return "";
  try {
    const s = typeof r.summary === "string" ? JSON.parse(r.summary) : r.summary;
    return s?.one_liner || "";
  } catch {
    return "";
  }
}

export default function ResultsPage() {
  const { id } = useParams(); // form id
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(null);
  const [responses, setResponses] = useState([]);
  const [busyId, setBusyId] = useState(null);

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

        const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}/results`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErr(data?.error || `Failed to load results (${res.status})`);
          setLoading(false);
          return;
        }

        setForm(data.form);
        setResponses(data.responses || []);
        setLoading(false);
      } catch (e) {
        console.log(e);
        setErr("Failed to load results.");
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const generateSummary = async (responseId) => {
    setBusyId(responseId);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/responses/${responseId}/summarize`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Failed to summarize");
        setBusyId(null);
        return;
      }

      // update that response locally
      setResponses((prev) =>
        prev.map((r) => (r.id === responseId ? { ...r, summary: data.summary } : r))
      );
    } catch (e) {
      console.log(e);
      alert("Failed to summarize");
    } finally {
      setBusyId(null);
    }
  };

  const profiles = useMemo(() => {
    return (responses || []).map((r) => {
      const candidateName = pickCandidateNameFromAnswers(r.answers || []);
      const oneLiner = getOneLiner(r);
      return { ...r, candidateName, oneLiner };
    });
  }, [responses]);

  if (loading) return <div className="min-h-screen bg-white p-6 text-sm text-neutral-600">Loading results…</div>;
  if (err) return <div className="min-h-screen bg-white p-6 text-sm text-red-600">{err}</div>;
  if (!form) return <div className="min-h-screen bg-white p-6 text-sm text-neutral-600">Form not found.</div>;

 

  function Chip({ label }) {
    return (
      <span className="
        rounded-full
        bg-orange-50
        border border-orange-200
        px-2.5 py-0.5
        text-[11px]
        font-medium
        text-orange-700
        whitespace-nowrap
      ">
        {label}
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-neutral-500">Results</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
              {form.name}
            </h1>
            <div className="mt-1 text-sm text-neutral-500">
              {profiles.length} candidate{profiles.length === 1 ? "" : "s"}
            </div>
          </div>

          <button
            onClick={() => navigate("/dashboard")}
            className="h-9 rounded-xl px-3 text-xs font-medium border border-neutral-200 bg-white text-neutral-900 shadow-sm transition hover:bg-neutral-50 hover:border-neutral-300 active:scale-[0.99]"
          >
            Back
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              {/* Top */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-neutral-900">
                    {r.candidateName}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="h-9 w-9 shrink-0 rounded-full border border-neutral-200 bg-white flex items-center justify-center text-xs font-semibold text-neutral-700">
                  {(r.candidateName || "C").slice(0, 1).toUpperCase()}
                </div>
              </div>

              {/* Summary */}
             {/* Summary */}
              <div className="mt-3 text-sm text-neutral-700">
                {r.oneLiner ? (
                  r.oneLiner
                ) : (
                  <span className="text-neutral-500">No summary yet.</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
              {(() => {
  let s = null;
  try {
    s = typeof r.summary === "string" ? JSON.parse(r.summary) : r.summary;
  } catch {}

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {(s?.strength_chips || []).slice(0, 5).map((chip, i) => (
        <Chip key={i} label={chip} />
      ))}
    </div>
  );
})()}
</div>
              {/* Actions */}
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  onClick={() => navigate(`/responses/${r.id}`)}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700"
                >
                  View full →
                </button>

               
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}