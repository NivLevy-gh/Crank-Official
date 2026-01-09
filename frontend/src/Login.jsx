import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useNavigate } from "react-router-dom";
import InfoBox from "./infoBox"
import google from "./assets/google1.png"
import logo from "./assets/logo.png";


export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return alert(error.message);

    alert("Logged in!");
    navigate("/dashboard");
  };

  useEffect(() => {
    const { data: { subscription } } =  supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN") {
          navigate("/dashboard");
        }
      });
  
    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
    });
  }

return (
  <div className="flex flex-col items-center">
    <img src={logo} alt="logo" className="w-50 h-14 my-8" />
  <div className="flex flex-col items-center border border-neutral-700 rounded-3xl w-[26rem] h-[30rem] mx-auto bg-neutral-800 p-4">
  <form className="flex items-center" onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <h2 className="text-2xl font-semibold text-white">Welcome back</h2>
    <h4 className="text-xs text-neutral-500 mb-4">Enter your credentials to access your account</h4>
    <InfoBox value={email} onChange={(e) => setEmail(e.target.value)} placeholder="John@example.com" label="Email"/>
     <InfoBox value={password} onChange={(e) => setPassword(e.target.value)} placeholder="*******" type="password" label="Password"/>
    <button className="border border-orange-300 w-[24rem] h-12 rounded-2xl bg-orange-300 mt-4 transition-transform duration-400 ease-out hover:scale-[1.02] cursor-pointer" type="submit">Sign in</button>
  </form>
  <div className="flex items-center w-full my-4">
<div className="flex-grow border-t border-neutral-700"></div>
<span className="mx-3 text-xs text-neutral-400">OR CONTINUE WITH</span>
<div className="flex-grow border-t border-neutral-700"></div>
</div>

<button
  type="button"
  onClick={signInWithGoogle}
  className="flex items-center justify-center gap-2 w-full h-10 border border-neutral-700 rounded-xl text-white transition-colors transition-transform duration-400 ease-out hover:bg-neutral-700 hover:scale-[1.02] cursor-pointer"

>
  <img src={google} className="w-5 h-5" />
  Continue with Google
</button>

<span className="text-xs mt-6 text-neutral-400">Already have an account? <a onClick={() => navigate("/")} className="text-blue-500 cursor-pointer hover:underline">Sign up</a></span>


  </div>
  </div>
);

}