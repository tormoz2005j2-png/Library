class LibraryApi {
  constructor(apiUrl) {
    this.apiUrl = String(apiUrl || "").replace(/\/$/, "");
    this.tokenKey = "library.apiToken";
  }

  isConfigured() {
    return this.apiUrl && !this.apiUrl.includes("YOUR_SUBDOMAIN");
  }

  getToken(forceNew = false) {
    if (forceNew) sessionStorage.removeItem(this.tokenKey);
    let token = sessionStorage.getItem(this.tokenKey);
    if (!token) {
      token = window.prompt("Введите личный ключ доступа к библиотеке:")?.trim() || "";
      if (token) sessionStorage.setItem(this.tokenKey, token);
    }
    return token;
  }

  async request(path, options = {}, canRetry = true) {
    if (!this.isConfigured()) {
      throw new Error("API не настроен. Укажите адрес в assets/js/config.js.");
    }

    const token = this.getToken();
    if (!token) throw new Error("Для доступа к библиотеке нужен личный ключ.");

    const response = await fetch(`${this.apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Library-Token": token,
        ...(options.headers || {})
      }
    });

    if (response.status === 401 && canRetry) {
      this.getToken(true);
      return this.request(path, options, false);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Ошибка API: ${response.status}`);
    return payload;
  }

  loadLibrary() {
    return this.request("/api/library", { method: "GET" });
  }

  saveCurrency(currency) {
    return this.request("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ currency })
    });
  }

  saveItem(item) {
    return this.request("/api/items", {
      method: "PUT",
      body: JSON.stringify(item)
    });
  }

  deleteItem(id) {
    return this.request(`/api/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  replaceLibrary(library) {
    return this.request("/api/library", {
      method: "PUT",
      body: JSON.stringify(library)
    });
  }
}

window.libraryApi = new LibraryApi(window.LIBRARY_CONFIG?.apiUrl);
