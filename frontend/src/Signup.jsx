import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";
import InfoBox from "./infoBox";
import google from "./assets/google1.png";
import logo from "./assets/logo.png";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) return alert(error.message);
    navigate("/dashboard");
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") navigate("/dashboard");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const signUpWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
    });
    if (error) alert(error.message);
  };

  return (
    <div className="min-h-screen bg-[rgb(253,249,244)]">
      {/* subtle top gradient */}
      <div className="h-40 w-full bg-gradient-to-b from-[rgb(250,232,217)] to-[rgb(253,249,244)]" />

      <div className="-mt-20 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img src={logo} alt="logo" className="h-10 w-auto" />
          </div>

          {/* Card */}
          <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="h-1.5 bg-[rgb(242,200,168)]" />

            <div className="p-6 sm:p-7">
              <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
                Create an account
              </h1>
              <p className="text-sm text-neutral-500 mt-1 mb-6">
                Get started in under a minute.
              </p>

              <form onSubmit={handleSignup} className="flex flex-col gap-3">
                {/* If your InfoBox supports className props, pass them.
                    If not, this still looks fine since the page theme matches. */}
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
                  placeholder="Create a password"
                />

                <button
                  type="submit"
                  className="
                    h-10 rounded-xl px-4
                    bg-[rgb(242,200,168)] text-neutral-900
                    text-sm font-semibold
                    border border-[rgb(242,200,168)]
                    hover:bg-[rgb(235,185,150)]
                    transition
                    shadow-sm
                  "
                >
                  Create account
                </button>
              </form>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-neutral-200" />
                <span className="text-[11px] font-medium text-neutral-400">or</span>
                <div className="h-px flex-1 bg-neutral-200" />
              </div>

              {/* Google */}
              <button
                type="button"
                onClick={signUpWithGoogle}
                className="
                  h-10 w-full rounded-xl
                  border border-neutral-200
                  bg-white text-neutral-900
                  text-sm font-semibold
                  flex items-center justify-center gap-2
                  hover:bg-[rgb(251,236,221)]
                  hover:border-[rgb(242,200,168)]
                  transition
                "
              >
                <img src={google} alt="google" className="h-4 w-4" />
                Continue with Google
              </button>

              {/* Footer */}
              <p className="mt-6 text-center text-xs text-neutral-500">
                Already have an account?{" "}
                <span
                  onClick={() => navigate("/login")}
                  className="cursor-pointer font-semibold text-[rgb(166,96,43)] hover:underline"
                >
                  Sign in
                </span>
              </p>
            </div>
          </div>

          {/* tiny footer note */}
          <p className="mt-4 text-center text-[11px] text-neutral-400">
            By continuing you agree to your Terms & Privacy.
          </p>
        </div>
      </div>
    </div>
  );
}