import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}

createRoot(document.getElementById("root")!).render(<App />);
