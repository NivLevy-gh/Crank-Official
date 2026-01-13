import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import ShareModal from "./ShareModal";
import Navbar from "./Navbar";

export default function Dashboard() {
  const [forms, setForms] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const navigate = useNavigate();

  const archiveForm = async (formId) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    try {
      const res = await fetch(`http://localhost:5001/forms/${formId}/archive`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ archived: true }),
      });

      if (!res.ok) {
        alert("Failed to archive");
        return;
      }

      // Remove from local state
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

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        navigate("/login");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      try {
        const res = await fetch("http://localhost:5001/forms", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErr(data?.error || "Failed to load forms");
          setLoading(false);
          return;
        }

        // Filter out archived forms
        const nonArchivedForms = (data.forms || []).filter(f => !f.archived);
        setForms(nonArchivedForms);
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
    return forms.filter((f) => (f.name || "").toLowerCase().includes(s));
  }, [forms, search]);

  if (loading) {
    return <div className="px-6 py-10 text-sm text-neutral-600">Loading…</div>;
  }

  if (err) {
    return <div className="px-6 py-10 text-sm text-red-600">{err}</div>;
  }

  return (
    <div className="w-full">
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={shareUrl}
      />

      {/* search row */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search forms…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="
            h-10 w-full max-w-sm rounded-xl border border-neutral-200 bg-white
            px-3 text-sm text-neutral-800 outline-none 
            focus:border-orange-200 focus:ring-2 focus:ring-orange-100
          "
        />
      </div>

      {/* list */}
      <div className="mt-5 flex flex-col gap-3">
        {filtered.map((form) => {
          const publicUrl = `${window.location.origin}/f/${form.share_token}`;

          return (
            <div
              key={form.ID}
              className="rounded-2xl border border-neutral-200 transition duration-300 hover:border-orange-200 hover:scale-101  bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-orange-100" />

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-neutral-900">
                    {form.name}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {form.summary || "—"}
                  </div>
                </div>

                {/* actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => archiveForm(form.ID)}
                    className="
                      h-9 rounded-xl px-3 text-xs font-medium
                      border border-neutral-200 text-neutral-700
                      hover:bg-neutral-50 transition
                    "
                  >
                    Archive
                  </button>

                  <button
                    onClick={() => {
                      setShareUrl(publicUrl);
                      setShareOpen(true);
                    }}
                    className="
                      h-9 rounded-xl px-3 text-xs font-medium
                      border border-neutral-200 text-neutral-700
                      hover:bg-neutral-50 transition
                    "
                  >
                    Share
                  </button>

                  <button
                    onClick={() => navigate(`/form/${form.ID}/results`)}
                    className="
                      h-9 rounded-xl px-3 text-xs font-medium
                      border border-neutral-200 text-neutral-700
                      hover:bg-neutral-50 transition
                    "
                  >
                    Results
                  </button>

                  <button
                    onClick={() => navigate(`/form/${form.ID}`)}
                    className="
                      h-9 rounded-xl px-3 text-xs font-medium
                      bg-orange-100 text-neutral-900 border border-orange-100
                      hover:bg-orange-200 transition
                      active:scale-[0.99]
                    "
                  >
                    Open
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
            No forms found.
          </div>
        )}
      </div>
    </div>
  );
}
