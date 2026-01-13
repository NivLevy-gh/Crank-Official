import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Dashboard from "./Dashboard";
import AppShell from "./AppShell";

export default function Form() {
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = async () => {
      const result = await supabase.auth.getUser();
      if (!result.data.user) navigate("/login");
    };
    checkUser();
  }, [navigate]);

  return (
    <AppShell>
      {/* page header (keeps your copy) */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-900">Forms</div>
          <div className="mt-1 text-xs text-neutral-500">
            Create, share, and review responses.
          </div>
        </div>
      </div>

      {/* your existing cards */}
      <div className="mt-6">
        <Dashboard />
      </div>
    </AppShell>
  );
}