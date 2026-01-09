  import { useEffect, useState } from "react";
  import { useNavigate } from "react-router-dom";
  import { supabase } from "./supabaseClient";


  export default function Dashboard() {
    const [dashboard, setDashboard] = useState([]);
    const [search, setSearch] = useState("");

   
    const navigate = useNavigate();

    useEffect(() => {
      const checkUser = async () => {
        const result = await supabase.auth.getUser();
        const user = result.data.user;
    
        if (!user) navigate("/login");
      };
    
      checkUser();
    }, [navigate]);


    useEffect(() => {
      const viewdashboard = async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
      
        const res = await fetch("http://localhost:5001/forms", {
          headers: { Authorization: `Bearer ${token}` }
        });
      
        const data = await res.json();
        setDashboard(data.forms);
      };

      viewdashboard();
  }, []);
 
  const filteredDashboard = dashboard.filter((form) =>
    form.name.toLowerCase().includes(search.toLowerCase())
  );
  
  return(
    
      <div className="flex flex-col gap-2 bg-red-500 w-[100%]"> 
      <div className="flex items-center"><input
  type="text"
  placeholder="Search forms..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  className="w-full max-w-md px-3 py-2 rounded-3xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-2 focus:ring-neutral-600 mr-8"
/>
<div className="w-24 h-9 border border-2 rounded-3xl ml-auto"></div>
</div>
          {filteredDashboard.map((form) => (
              <div className="border border-2 w-[100%] h-12 rounded-xl flex p-2 items-center">
                <div className="border border-1 w-8 h-8 rounded-sm"></div>
                <div className="bg-blue-500 h-10">
                  <button classname=""key={form.ID} onClick={() => navigate(`/form/${form.ID}`)}>{form.name}</button>
                  <h3 className="leading-none m-0 text-xs">Created on </h3>
                </div>
              </div> 
))}
</div>


  )
}
