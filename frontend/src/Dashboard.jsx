import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import ShareModal from "./ShareModal";

export default function Dashboard() {
  const navigate = useNavigate();

  const [forms, setForms] = useState([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const archiveForm = async (formId) => {
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
          body: JSON.stringify({ archived: true }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data?.error || "Failed to archive");
        return;
      }

      setForms((prev) => prev.filter((f) => f.ID !== formId));
    } catch (e) {
      console.log(e);
      alert("Failed to archive");
    }
  };

  useEffect(() => {
    const run = async () => {
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

        const nonArchived = (data.forms || []).filter((f) => !f.archived);
        setForms(nonArchived);
      } catch (e) {
        console.log(e);
        setErr("Failed to load forms");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [navigate]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return forms;
    return forms.filter((f) => {
      const name = (f.name || "").toLowerCase();
      const summary = (f.summary || "").toLowerCase();
      return name.includes(s) || summary.includes(s);
    });
  }, [forms, search]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white/60 px-5 py-4 text-sm text-neutral-600">
        Loading…
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        {err}
      </div>
    );
  }

  return (
    <div className="w-full">
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} url={shareUrl} />

      {/* Header row */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">All forms</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {forms.length} form{forms.length === 1 ? "" : "s"}
          </p>
        </div>

        {/* Search */}
        <div className="w-full max-w-sm">
          <input
            type="text"
            placeholder="Search forms…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-white/70 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-orange-100"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {filtered.map((form) => {
          const publicUrl = `${window.location.origin}/f/${form.share_token}`;

          return (
            <div
              key={form.ID}
              className="group rounded-2xl border border-neutral-200 bg-white/70 px-4 py-3 transition hover:bg-white hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                {/* icon */}
                <div className="h-9 w-9 shrink-0 rounded-xl bg-orange-100 border border-orange-100" />

                {/* main click area */}
                <button
                  type="button"
                  onClick={() => navigate(`/form/${form.ID}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium text-neutral-900">
                    {form.name}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {form.summary || "—"}
                  </div>
                </button>

                {/* actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShareUrl(publicUrl);
                      setShareOpen(true);
                    }}
                    className="h-9 rounded-xl px-3 text-xs font-semibold border border-neutral-200 bg-white/60 text-neutral-800 hover:bg-white transition focus:outline-none focus:ring-2 focus:ring-orange-100"
                  >
                    Share
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate(`/form/${form.ID}/results`)}
                    className="h-9 rounded-xl px-3 text-xs font-semibold border border-neutral-200 bg-white/60 text-neutral-800 hover:bg-white transition focus:outline-none focus:ring-2 focus:ring-orange-100"
                  >
                    Results
                  </button>

                  <button
                    type="button"
                    onClick={() => archiveForm(form.ID)}
                    className="h-9 rounded-xl px-3 text-xs font-semibold border border-neutral-200 bg-white/60 text-neutral-800 hover:bg-white transition focus:outline-none focus:ring-2 focus:ring-orange-100"
                  >
                    Archive
                  </button>

                  {/* Primary */}
                  <button
                    type="button"
                    onClick={() => navigate(`/form/${form.ID}`)}
                    className="h-9 rounded-xl px-3 text-xs font-semibold bg-orange-100 text-neutral-900 border border-orange-100 hover:bg-orange-200 transition active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-orange-100"
                  >
                    Open
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-neutral-200 bg-white/70 p-8">
            <div className="text-sm font-semibold text-neutral-900">No forms found</div>
            <div className="mt-1 text-sm text-neutral-500">
              Try a different search, or create a new form.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}