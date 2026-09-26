import { API_BASE } from "./utils";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const error = new Error(err.detail || "Request failed");
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export const api = {
  getTasks: (userId) => request(`/api/tasks?user_id=${userId}`),
  createTask: (userId, body) =>
    request(`/api/tasks?user_id=${userId}`, { method: "POST", body: JSON.stringify(body) }),
  updateTask: (userId, taskId, body) =>
    request(`/api/tasks/${taskId}?user_id=${userId}`, { method: "PATCH", body: JSON.stringify(body) }),
  resetStale: (userId, taskId) =>
    request(`/api/tasks/${taskId}/reset-stale?user_id=${userId}`, { method: "POST" }),
  reorder: (userId, status, orderedIds) =>
    request(`/api/tasks/reorder?user_id=${userId}`, {
      method: "POST",
      body: JSON.stringify({ status, ordered_ids: orderedIds }),
    }),
  deleteTask: (userId, taskId) =>
    request(`/api/tasks/${taskId}?user_id=${userId}`, { method: "DELETE" }),
};
