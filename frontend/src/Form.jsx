import { useState } from "react";

export default function Form() {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [baseQuestions, setQuestions] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const res = await fetch("http://localhost:5001/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, summary, baseQuestions }),
      });
      alert("Form Submitted!");
      console.log("hello")
    } catch (error) {
      alert("Failed to submit form. Please try again.");
      console.log("hi")
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "10px" }}
    >
      <input
        type="text"
        placeholder="Form name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <textarea
        placeholder="What's the form for?"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />

    <textarea
        placeholder="enter your base questions"
        value={baseQuestions}
        onChange={(e) => setQuestions(e.target.value)}
      />

      <button type="submit">Submit</button>
    </form>
  );
}