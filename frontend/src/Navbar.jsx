
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabaseClient";


import home from "./assets/home.png";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      console.log("User data:", data.user);
      console.log("Avatar URL:", data.user?.user_metadata?.avatar_url);
      setUser(data.user || null);
    });
  }, []);

  
  return (
    
    <div className="sticky top-0 z-40 w-full bg-white">
      <div onClick={() => navigate("/dashboard")} className="mx-auto flex h-14 max-w-6xl items-center px-6 ">
        {/* LEFT 
        <div className="flex items-center justify-center h-10 w-10 border border-neutral-200 gap-2 rounded-xl transition duration-300 hover:scale-105 hover:bg-orange-100 cursor-pointer">
          <img 
            src={home} 
            className="w-4 h-3.5"  
            alt="home"
          />
        </div>
        */}
       
      </div>
    </div>
  );
}
