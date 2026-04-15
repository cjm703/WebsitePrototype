import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { seedInitialData } from "./app/components/initial-data";
import "./styles/index.css";

if (typeof window !== "undefined") {
  try {
    seedInitialData();
  } catch (error) {
    console.warn("Failed to seed initial app data", error);
  }
}

createRoot(document.getElementById("root")!).render(<App />);
