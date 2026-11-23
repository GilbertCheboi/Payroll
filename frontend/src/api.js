// frontend/src/api.js
import axios from "axios";

const API = axios.create({
  // Use Vite's env var in development, fallback to relative path in production
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/",
});

// Automatically inject JWT tokens into headers if they exist in localStorage
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    const isPasswordResetRequest = config.url?.startsWith(
      "auth/password-reset/",
    );
    if (token && !isPasswordResetRequest) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const organizationId = localStorage.getItem("organization_id");
    if (organizationId) {
      config.headers["X-Organization-ID"] = organizationId;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Redirect to login on 401 so the app can re-authenticate.
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.reload();
    }
    return Promise.reject(error);
  },
);

export default API;
