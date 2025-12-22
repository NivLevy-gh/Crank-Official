    import { useParams } from "react-router-dom";
    import { useEffect, useState } from "react";


    export default function FormPage() {
    const { id } = useParams();
    const [crank, setCrank] = useState(null);


    useEffect(() => {
        const loadform = async () => {
          const res = await fetch(`http://localhost:5001/forms/${id}`);
          const data = await res.json();
          setCrank(data.forms)
        };
        
        loadform();
    }, [id]);

    if (!crank) return <p>Loading...</p>; 
    
    return (
        <div>
        <h2>Form Page</h2>
        <p>Form ID: {id}</p>
        <p>{crank.name}</p>
        <p>{crank.summary}</p>
        <p>{crank.baseQuestions}</p>
        </div>
    );
    }
