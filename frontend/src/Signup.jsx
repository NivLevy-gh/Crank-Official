import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";
import InfoBox from "./InfoBox";
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
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src={logo} alt="logo" className="h-15 w-30 mb-0 w-auto" />
        </div>

        {/* Card */}
        <div className="border border-neutral-200 rounded-lg p-5">
          <h1 className="text-lg font-medium text-neutral-900">
            Create an account
          </h1>
          <p className="text-xs text-neutral-500 mt-1 mb-4">
            Get started in under a minute
          </p>

          <form onSubmit={handleSignup} className="flex flex-col gap-3">
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
                h-9 rounded-md
                bg-neutral-900 text-white
                text-sm
                hover:bg-neutral-800
                transition
              "
            >
              Create account
            </button>
          </form>

          {/* Divider */}
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="text-[10px] text-neutral-400">or</span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={signUpWithGoogle}
            className="
              h-9 w-full rounded-md
              border border-neutral-200
              bg-white text-neutral-900
              text-sm
              flex items-center justify-center gap-2
              hover:bg-neutral-50
              transition
            "
          >
            <img src={google} alt="google" className="h-4 w-4" />
            Continue with Google
          </button>

          {/* Footer */}
          <p className="mt-5 text-center text-[11px] text-neutral-500">
            Already have an account?{" "}
            <span
              onClick={() => navigate("/login")}
              className="cursor-pointer text-neutral-900 hover:underline"
            >
              Sign in
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}