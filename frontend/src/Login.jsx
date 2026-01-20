import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";
import InfoBox from "./infoBox";
import google from "./assets/google1.png";
import logo from "./assets/logo.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (busy) return;

    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return alert(error.message);
      navigate("/dashboard");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") navigate("/dashboard");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
    if (error) alert(error.message);
  };

  return (
    <div className="min-h-screen bg-[#f7f5f1]">
      {/* subtle top gradient */}
      <div className="h-40 w-full bg-[#f7f5f1]" />

      <div className="-mt-20 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img src={logo} alt="logo" className="h-10 w-auto" />
          </div>

          {/* Card */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="p-6 sm:p-7">
              <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
                Sign in</h1>
                <p className="text-sm text-neutral-500 mt-1 mb-6">
                Enter your credentials
              </p>

              <form onSubmit={handleLogin} className="flex flex-col gap-3">
                <InfoBox
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />

                <InfoBox
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />

                <button
                  type="submit"
                  disabled={busy}
                  className="
                    h-10 rounded-md px-4 text-sm font-semibold
                    bg-[rgb(242,200,168)] text-neutral-900
                    border border-[rgb(242,200,168)]
                    hover:bg-[rgb(235,185,150)]
                    transition shadow-sm
                    disabled:opacity-60 disabled:cursor-not-allowed
                  "
                >
                  {busy ? "Signing in…" : "Sign in"}
                </button>
              </form>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-neutral-200" />
                <span className="text-[10px] text-neutral-400">or</span>
                <div className="h-px flex-1 bg-neutral-200" />
              </div>

              {/* Google */}
              <button
                type="button"
                onClick={signInWithGoogle}
                className="
                  h-10 w-full rounded-md
                  border border-neutral-200
                  bg-white text-neutral-900
                  text-sm font-semibold
                  flex items-center justify-center gap-2
                  hover:bg-[rgb(251,236,221)]
                  transition
                "
              >
                <img src={google} alt="google" className="h-4 w-4" />
                Continue with Google
              </button>

              {/* Footer */}
              <p className="mt-6 text-center text-xs text-neutral-500">
                Don’t have an account?{" "}
                <span
                  onClick={() => navigate("/")}
                  className="cursor-pointer text-[rgb(166,96,43)] hover:underline font-medium"
                >
                  Sign up
                </span>
              </p>
            </div>
          </div>

          {/* tiny helper text */}
          <div className="mt-4 text-center text-[11px] text-neutral-400">
            By signing in, you agree to your Terms & Privacy Policy.
          </div>
        </div>
      </div>
    </div>
  );
}