import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

import logo from "./assets/logo.png";

export default function AppShell({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        console.log("User data:", data);
        console.log("Avatar URL:", data?.user?.user_metadata?.avatar_url);
        
        if (error) {
          console.error("Error getting user:", error);
          return;
        }
        
        if (data?.user) {
          setUser(data.user);
        }
      } catch (err) {
        console.error("Exception:", err);
      }
    };

    loadUser();
  }, []);

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-neutral-200 bg-[#f7f5f1] px-4 py-5">
        <div
          className="flex items-center gap-2 cursor-pointer mb-6"
          onClick={() => navigate("/dashboard")}
        >
          <img src={logo} className="h-8" alt="logo" />
        </div>
        <nav className="flex flex-col gap-1">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-left px-3 py-2 rounded-lg text-sm text-neutral-700 transition duration-300 hover:scale-[1.03] hover:bg-neutral-50 hover:text-neutral-900"
          >
            All forms
          </button>
          <button
            onClick={() => navigate("/archive")}
            className="text-left px-3 py-2 rounded-lg text-sm text-neutral-700 transition duration-300 hover:scale-[1.03] hover:bg-neutral-50 hover:text-neutral-900"
          >
            Archive
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="text-left px-3 py-2 rounded-lg text-sm text-neutral-700 transition duration-300 hover:scale-[1.03] hover:bg-neutral-50 hover:text-neutral-900"
          >
            Settings
          </button>
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-14 border-b border-neutral-200 bg-[#f7f5f1] px-6 flex items-center justify-between">
        {user?.user_metadata?.avatar_url ? (
            <img
              src={user.user_metadata.avatar_url}
              alt="profile"
              className="h-9 w-9 rounded-xl border border-neutral-300 shadow-sm"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-neutral-300" />
          )}

          
        <button
          onClick={() => navigate("/createform")}
          className="
            h-9 rounded-xl px-3 text-xs font-medium
            bg-orange-100 text-neutral-900 border border-orange-200
            hover:bg-orange-200 transition
            active:scale-[0.99]
          "
        >
          + New form
        </button>
         
        </header>

        {/* Content canvas */}
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}