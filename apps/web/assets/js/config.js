const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

window.LIBRARY_CONFIG = Object.freeze({
  apiUrl: isLocal ? "http://localhost:3000" : window.location.origin
});
