import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

export default function Archive() {
  const navigate = useNavigate();

  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter((f) => {
      const name = (f.name || "").toLowerCase();
      const summary = (f.summary || "").toLowerCase();
      return name.includes(q) || summary.includes(q);
    });
  }, [forms, query]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr("");

      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) {
          navigate("/login");
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        const res = await fetch(`${import.meta.env.VITE_API_URL}/forms`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErr(data?.error || "Failed to load forms");
          return;
        }

        // archived only
        const archived = (data.forms || []).filter((f) => f.archived);
        setForms(archived);
      } catch (e) {
        console.log(e);
        setErr("Failed to load forms");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate]);

  const unarchiveForm = async (formId) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/forms/${formId}/archive`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ archived: false }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data?.error || "Failed to unarchive");
        return;
      }

      setForms((prev) => prev.filter((f) => f.ID !== formId));
    } catch (e) {
      console.log(e);
      alert("Failed to unarchive");
    }
  };

  if (loading)
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white/60 px-5 py-4 text-sm text-neutral-600">
        Loading…
      </div>
    );

  if (err)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        {err}
      </div>
    );

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">
            Archived forms
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {forms.length} archived form{forms.length === 1 ? "" : "s"}
          </p>
        </div>

        {/* Search */}
        <div className="w-full max-w-sm">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search archived…"
            className="w-full rounded-xl border border-neutral-200 bg-white/70 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-orange-100"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {filtered.map((form) => (
          <div
            key={form.ID}
            className="group rounded-2xl border border-neutral-200 bg-white/70 px-4 py-3 transition hover:bg-white hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(`/form/${form.ID}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="h-9 w-9 shrink-0 rounded-xl bg-neutral-100 border border-neutral-200" />

                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-neutral-900">
                    {form.name}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {form.summary || "—"}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => unarchiveForm(form.ID)}
                className={[
                  "h-9 rounded-xl px-3 text-xs font-semibold",
                  "bg-white text-neutral-900 border border-neutral-200",
                  "hover:bg-neutral-50 active:bg-neutral-100 transition",
                  "focus:outline-none focus:ring-2 focus:ring-orange-100",
                ].join(" ")}
              >
                Unarchive
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-neutral-200 bg-white/70 p-8">
            <div className="text-sm font-semibold text-neutral-900">
              No archived forms
            </div>
            <div className="mt-1 text-sm text-neutral-500">
              Archive forms from your dashboard to keep things clean.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}