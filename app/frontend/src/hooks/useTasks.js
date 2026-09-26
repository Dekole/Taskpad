import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

export function useTasks(userId, onUnauthorized) {
  const [tasks, setTasks] = useState({ active: [], done: [], backlog: [], expired: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTasks = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getTasks(userId);
      setTasks(data);
    } catch (e) {
      if (e.status === 401) {
        onUnauthorized?.();
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const createTask = async (title, category, due_date) => {
    const task = await api.createTask(userId, { title, category, due_date });
    setTasks((prev) => ({ ...prev, active: [...prev.active, task] }));
  };

  const updateTask = async (taskId, updates) => {
    const updated = await api.updateTask(userId, taskId, updates);
    setTasks((prev) => {
      const next = { active: [], done: [], backlog: [], expired: [] };
      for (const section of ["active", "done", "backlog", "expired"]) {
        next[section] = prev[section].map((t) => (t.id === taskId ? updated : t));
        // If status changed, move to correct section
        if (updates.status && updates.status !== section) {
          next[section] = next[section].filter((t) => t.id !== taskId);
        }
      }
      if (updates.status) {
        const already = next[updates.status].find((t) => t.id === taskId);
        if (!already) next[updates.status] = [...next[updates.status], updated];
      }
      return next;
    });
  };

  const resetStale = async (taskId) => {
    const updated = await api.resetStale(userId, taskId);
    setTasks((prev) => ({
      ...prev,
      active: prev.active.map((t) => (t.id === taskId ? updated : t)),
      done: prev.done.map((t) => (t.id === taskId ? updated : t)),
      backlog: prev.backlog.map((t) => (t.id === taskId ? updated : t)),
      expired: prev.expired.map((t) => (t.id === taskId ? updated : t)),
    }));
  };

  const reorder = async (status, orderedIds) => {
    await api.reorder(userId, status, orderedIds);
    setTasks((prev) => ({
      ...prev,
      [status]: orderedIds.map((id) => prev[status].find((t) => t.id === id)).filter(Boolean),
    }));
  };

  const deleteTask = async (taskId) => {
    await api.deleteTask(userId, taskId);
    setTasks((prev) => ({
      active: prev.active.filter((t) => t.id !== taskId),
      done: prev.done.filter((t) => t.id !== taskId),
      backlog: prev.backlog.filter((t) => t.id !== taskId),
      expired: prev.expired.filter((t) => t.id !== taskId),
    }));
  };

  return { tasks, loading, error, fetchTasks, createTask, updateTask, resetStale, reorder, deleteTask };
}
