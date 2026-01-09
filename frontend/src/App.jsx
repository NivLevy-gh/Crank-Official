import { Routes, Route } from "react-router-dom";
import Login from "./Login";
import Signup from "./Signup";
import Form from "./Form";
import FormPage from "./FormPage";
import NewForm from "./NewForm"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Form />} />
      <Route path="/form/:id" element={<FormPage />} />
      <Route path="/createform" element={<NewForm />} />
    </Routes>
  );
}