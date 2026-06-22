const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

window.LIBRARY_CONFIG = Object.freeze({
  apiUrl: isLocal
    ? `http://localhost:${window.localStorage.getItem("library.apiPort") || "8787"}`
    : "https://library-api.tormoz2005j2.workers.dev"
});
