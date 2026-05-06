import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

if (import.meta.hot) {
  let wasDisconnected = false;
  import.meta.hot.on("vite:ws:disconnect", () => {
    wasDisconnected = true;
  });
  import.meta.hot.on("vite:ws:connect", () => {
    if (wasDisconnected) {
      wasDisconnected = false;
      window.location.reload();
    }
  });
}
