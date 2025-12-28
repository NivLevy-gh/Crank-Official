    import { useParams } from "react-router-dom";
    import { useEffect, useState } from "react";


    export default function FormPage() {
    const { id } = useParams();
    const [crank, setCrank] = useState(null);    
    const [answers, setAnswers] = useState({});

    useEffect(() => {
        const loadform = async () => {
          const res = await fetch(`http://localhost:5001/forms/${id}`);
          const data = await res.json();
          setCrank(data.forms)
        };
        
        loadform();
    }, [id]);

    if (!crank) return <p>Loading...</p>; 

    const questions = crank.baseQuestions.split("\n")


    const handleSubmit = async (e) => {
        e.preventDefault();
        
        try {
          const res = await fetch(`http://localhost:5001/forms/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ formid: id, answers }),
          });
          alert("Form Submitted!");
        } catch (error) {
          alert("Failed to submit form. Please try again.");
        }
      };

    return (
        <div>
        <h2>Form Page</h2>
        <p>Form ID: {id}</p>

<form
    onSubmit={handleSubmit}
    style={{ display: "flex", flexDirection: "column", gap: "10px" }}
    >

    {questions.map((q, i) =>
    <div key={i}>
    <p>{q}</p>
    <textarea value={answers[i] || ""} onChange={(e) => setAnswers(prev => ({ ...prev, [i]: e.target.value }))}/>
    </div>
    )}

      <button type="submit">Submit</button>
    </form>

</div>
    );
    }
