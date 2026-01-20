// ResultsPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Navbar from "./Navbar";

function safeJsonParse(v) {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function pickCandidateNameFromAnswers(answers = []) {
  const nameLike = answers.find((qa) =>
    (qa?.question || "").toLowerCase().includes("name")
  );
  const name = (nameLike?.answer || "").trim();
  return name || "Candidate";
}

function getSummaryObj(r) {
  if (!r?.summary) return null;
  if (typeof r.summary === "string") return safeJsonParse(r.summary);
  return r.summary;
}

function getOneLiner(r) {
  const s = getSummaryObj(r);
  return s?.one_liner || "";
}

function Chip({ label }) {
  return (
    <span
      className="
        rounded-lg
        bg-[rgb(251,236,221)]
        border border-[rgb(242,200,168)]
        px-2.5 py-1
        text-[11px]
        font-semibold
        text-[rgb(166,96,43)]
        whitespace-nowrap
      "
    >
      {label}
    </span>
  );
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

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/forms/${id}/results`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

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

  // (Optional) keep this for later if you re-add a button
  const generateSummary = async (responseId) => {
    setBusyId(responseId);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/responses/${responseId}/summarize`,
        {
          method: "POST",
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Failed to summarize");
        return;
      }

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
      const summaryObj = getSummaryObj(r);
      const chips = (summaryObj?.strength_chips || []).slice(0, 5);
      return { ...r, candidateName, oneLiner, chips };
    });
  }, [responses]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[rgb(253,249,244)] flex items-center justify-center">
        <div className="text-sm text-neutral-600">Loading results…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-[rgb(253,249,244)] flex items-center justify-center px-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-[rgb(253,249,244)] flex items-center justify-center">
        <div className="text-sm text-neutral-600">Form not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(253,249,244)]">

      {/* peach top gradient */}
      <div className="h-28 w-full bg-gradient-to-b from-[rgb(250,232,217)] to-[rgb(253,249,244)]" />

      <div className="-mt-14 pb-16">
        <div className="mx-auto max-w-6xl px-4">
          {/* Header card */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="h-1.5 bg-[rgb(242,200,168)]" />
            <div className="p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-neutral-500">Results</div>
                  <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900 truncate">
                    {form.name}
                  </h1>
                  <div className="mt-2 text-sm text-neutral-500">
                    {profiles.length} candidate{profiles.length === 1 ? "" : "s"}
                  </div>
                </div>

                <button
                  onClick={() => navigate("/dashboard")}
                  className="h-10 rounded-md px-4 text-sm font-semibold border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 transition"
                >
                  Back
                </button>
              </div>
            </div>
          </div>

          {/* Grid */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden"
              >
                <div className="p-5">
                  {/* top row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-neutral-900">
                        {r.candidateName}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="h-9 w-9 shrink-0 rounded-lg border border-neutral-200 bg-[rgb(253,249,244)] flex items-center justify-center text-xs font-semibold text-neutral-700">
                      {(r.candidateName || "C").slice(0, 1).toUpperCase()}
                    </div>
                  </div>

                  {/* summary */}
                  <div className="mt-3 text-sm text-neutral-700 leading-relaxed">
                    {r.oneLiner ? (
                      r.oneLiner
                    ) : (
                      <span className="text-neutral-500">No summary yet.</span>
                    )}
                  </div>

                  {/* chips */}
                  {r.chips?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.chips.map((chip, i) => (
                        <Chip key={i} label={chip} />
                      ))}
                    </div>
                  )}

                  {/* actions */}
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      onClick={() => navigate(`/responses/${r.id}`)}
                      className="text-xs font-semibold text-[rgb(166,96,43)] hover:text-[rgb(140,78,33)]"
                    >
                      View full →
                    </button>

                    {/* Optional: add back a summarize button per card if you want */}
                    {/* {!r.oneLiner && (
                      <button
                        onClick={() => generateSummary(r.id)}
                        disabled={busyId === r.id}
                        className="
                          h-9 rounded-md px-3 text-xs font-semibold
                          bg-[rgb(251,236,221)] text-[rgb(166,96,43)]
                          border border-[rgb(242,200,168)]
                          hover:bg-[rgb(247,225,205)]
                          transition disabled:opacity-60 disabled:cursor-not-allowed
                        "
                      >
                        {busyId === r.id ? "Generating…" : "Generate"}
                      </button>
                    )} */}
                  </div>
                </div>
              </div>
            ))}

            {profiles.length === 0 && (
              <div className="rounded-xl border border-neutral-200 bg-white shadow-sm p-6 text-sm text-neutral-600">
                No responses yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}