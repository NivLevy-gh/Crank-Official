import { StrictMode } from 'react'
import ReactDOM from "react-dom/client";
import './index.css'
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";


ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
  <div className="bg-neutral-900/98 min-h-screen">
    <App />
    </div>
  </BrowserRouter>
);
