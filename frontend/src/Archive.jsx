import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

export default function Archive() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
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
        const res = await fetch(`${import.meta.env.VITE_API_URL}/forms`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErr(data?.error || "Failed to load forms");
          setLoading(false);
          return;
        }

        // Filter archived forms on frontend
        setForms((data.forms || []).filter(f => f.archived));
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
      const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/${formId}/archive`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ archived: false }),
      });

      if (!res.ok) {
        alert("Failed to unarchive");
        return;
      }

      setForms((prev) => prev.filter((f) => f.ID !== formId));
    } catch (e) {
      console.log(e);
      alert("Failed to unarchive");
    }
  };

  if (loading) return <div className="px-6 py-10 text-sm text-neutral-600">Loading…</div>;
  if (err) return <div className="px-6 py-10 text-sm text-red-600">{err}</div>;

  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-neutral-900">Archived Forms</h2>
        <p className="text-sm text-neutral-500">{forms.length} archived form{forms.length === 1 ? '' : 's'}</p>
      </div>

      <div className="flex flex-col gap-3">
        {forms.map((form) => (
          <div
            key={form.ID}
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-neutral-100" />

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-neutral-900">
                  {form.name}
                </div>
                <div className="truncate text-xs text-neutral-500">
                  {form.summary || "—"}
                </div>
              </div>

              <button
                onClick={() => unarchiveForm(form.ID)}
                className="
                  h-9 rounded-xl px-3 text-xs font-medium
                  bg-orange-100 text-neutral-900 border border-orange-100
                  hover:bg-orange-200 transition
                  active:scale-[0.99]
                "
              >
                Unarchive
              </button>
            </div>
          </div>
        ))}

        {forms.length === 0 && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
            No archived forms.
          </div>
        )}
      </div>
    </div>
  );
}