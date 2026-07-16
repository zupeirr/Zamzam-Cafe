const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  let token = "";
  if (typeof window !== "undefined") {
    token = localStorage.getItem("admin_token") || "";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("admin_token")
      window.location.href = "/login"
    }
    throw new Error(data.message || `API Error: ${response.status}`);
  }

  return data;
}
