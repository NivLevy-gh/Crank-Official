import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import logo from "./assets/logo.png";

export default function AppShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(null);

  // -------------------------
  // Load + listen for auth user
  // -------------------------
  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user ?? null);
    };

    loadUser();

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // -------------------------
  // Hide shell on auth routes
  // -------------------------
  const hideShellRoutes = ["/login", "/signup"];
  if (hideShellRoutes.includes(location.pathname)) {
    return children;
  }

  // -------------------------
  // Navigation
  // -------------------------
  const navItems = [
    { label: "All forms", path: "/dashboard" },
    { label: "Archive", path: "/archive" },
    { label: "Settings", path: "/settings" },
  ];

  const isActive = (path) =>
    location.pathname === path ||
    location.pathname.startsWith(path + "/");

  return (
    <div className="min-h-screen bg-[#f7f5f1] flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-neutral-200 bg-[#f7f5f1] flex flex-col">
        <div className="px-4 py-5">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/60 transition"
          >
            <img src={logo} className="h-7" alt="logo" />
          </button>

          <nav className="mt-6 flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={[
                  "text-left px-3 py-2 rounded-lg text-sm transition",
                  "text-neutral-700 hover:bg-white/70 hover:text-neutral-900",
                  "focus:outline-none focus:ring-2 focus:ring-orange-100",
                  isActive(item.path)
                    ? "bg-white/80 text-neutral-900 border border-neutral-200"
                    : "border border-transparent",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* User chip */}
        <div className="mt-auto px-4 pb-5">
          <div className="rounded-md border border-neutral-200 bg-white/60 px-3 py-2 flex items-center gap-3">
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt="profile"
                className="h-8 w-8 rounded-lg border border-neutral-200"
              />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-neutral-200" />
            )}

            <div className="min-w-0">
              <div className="text-xs font-semibold text-neutral-900 truncate">
                {user?.user_metadata?.full_name ||
                  user?.user_metadata?.name ||
                  "Account"}
              </div>
              <div className="text-[11px] text-neutral-600 truncate">
                {user?.email || ""}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-14 border-b border-neutral-200 bg-[#f7f5f1] px-6 flex items-center justify-between">
          <div className="text-sm font-semibold text-neutral-900" />

          <button
            type="button"
            onClick={() => navigate("/createform")}
            className="h-9 rounded-lg px-3 text-sm font-semibold bg-white text-neutral-900 border border-neutral-200 hover:bg-neutral-50 active:bg-neutral-100 transition focus:outline-none focus:ring-2 focus:ring-orange-100"
          >
            + New form
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}