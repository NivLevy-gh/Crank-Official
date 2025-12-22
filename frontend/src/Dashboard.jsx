  import { useEffect, useState } from "react";
  import { useNavigate } from "react-router-dom";


  export default function Dashboard() {
    const [dashboard, setDashboard] = useState([]);

    useEffect(() => {
      const viewdashboard = async () => {
        const res = await fetch("http://localhost:5001/forms");
        const data = await res.json();
        setDashboard(data.forms);
      };

      viewdashboard();
  }, []);

  const navigate = useNavigate();

  return(
      <div className="flex flex-col">
          <h2>Saved Forms</h2>
          
          {dashboard.map((form) => (
    <button key={form.ID} onClick={() => navigate(`/form/${form.ID}`)}>{form.name}</button>

))}


  
  
      </div>
  )
}
