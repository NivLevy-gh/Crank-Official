import { Routes, Route } from "react-router-dom";
import Login from "./Login";
import Signup from "./Signup";
import Form from "./Form";
import FormPage from "./FormPage";
import NewForm from "./NewForm"
import PublicFormPage from "./PublicFormPage"
import ResultsPage from "./ResultsPage"
import ResponseDetail from "./ResponseDetail"
import Archive from "./Archive"
import AppShell from "./AppShell"

export default function App() {
  return (
    <Routes>
      <Route path="/f/:shareToken" element={<PublicFormPage />} />
      <Route path="/form/:id/results" element={<ResultsPage />} />
      <Route path="/responses/:responseId" element={<ResponseDetail />} />  
      <Route path="/" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Form />} />
      <Route path="/form/:id" element={<FormPage />} />
      <Route path="/createform" element={<NewForm />} />  
      <Route path="/archive" element={<AppShell><Archive /></AppShell>} />
    </Routes>
  );
}
