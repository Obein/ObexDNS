import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n/config";
import App from "./App.tsx";
import { OverlaysProvider, FocusStyleManager } from "@blueprintjs/core";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

FocusStyleManager.onlyShowFocusOnTabs();

// Request browser geolocation once on app load and cache it in sessionStorage
if (typeof window !== "undefined" && navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      sessionStorage.setItem("client_lat", position.coords.latitude.toString());
      sessionStorage.setItem("client_lon", position.coords.longitude.toString());
    },
    (error) => {
      console.warn("Geolocation access denied or failed:", error);
    },
    { enableHighAccuracy: true, timeout: 5000 }
  );
}

// Global window.fetch interceptor to append client coordinates headers to API requests
const originalFetch = window.fetch;
window.fetch = async function (input, init) {
  let url = "";
  if (typeof input === "string") {
    url = input;
  } else if (input instanceof URL) {
    url = input.href;
  } else if (input && typeof input === "object" && "url" in input) {
    url = (input as any).url;
  }

  // Only intercept same-origin or relative /api/ requests
  if (url.startsWith("/api/") || url.includes(window.location.host + "/api/")) {
    const lat = sessionStorage.getItem("client_lat");
    const lon = sessionStorage.getItem("client_lon");
    if (lat && lon) {
      init = init || {};
      const headers = new Headers(init.headers);
      headers.set("X-Client-Latitude", lat);
      headers.set("X-Client-Longitude", lon);
      init.headers = headers;
    }
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById("root")!).render(
  <OverlaysProvider>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </OverlaysProvider>
);

