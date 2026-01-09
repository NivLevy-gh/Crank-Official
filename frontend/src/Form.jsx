import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Dashboard from "./Dashboard";
import logo from "./assets/logo.png";


export default function Form() {
  const navigate = useNavigate();


  useEffect(() => {
    const checkUser = async () => {
      const result = await supabase.auth.getUser();
      const user = result.data.user;
  
      if (!user) navigate("/login");
    };
  
    checkUser();
  }, [navigate]);



  return (
    <div>
 <div className="min-h-screen ">
      {/* Top bar */}
      <div className="border-b border-neutral-800 px-6 py-4 flex items-center">
        <img src={logo} className="w-28 h-8" />
        <div className="ml-auto w-10 h-10 border border-neutral-700 rounded-full" />
      </div>


      <div className="flex p-4">
      <div className="bg-blue-500 w-40 h-10">
      <button className="border border-orange-300 w-32 h-8 rounded-md bg-orange-300 mt-4 transition-transform duration-400 ease-out hover:scale-[1.02] cursor-pointer" onClick={() => navigate("/createform")} type="submit">+ New Form</button>
      </div>

      <Dashboard />
    
      </div>
  </div>
  </div>
  );
  }

    
