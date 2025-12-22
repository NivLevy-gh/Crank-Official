import { Routes, Route } from "react-router-dom";
import Form from "./Form";
import Dashboard from "./Dashboard";
import FormPage from "./FormPage";

function App() {
    return (
      <Routes>
        <Route path="/" element={
          <div style={{ padding: "20px" }}>
            <h1>React → Express Form</h1>
            <Form />
            <Dashboard />
          </div>
        }/>
        <Route path="/form/:id" element={<FormPage />} />
      </Routes>
    );
  }
  
  export default App;