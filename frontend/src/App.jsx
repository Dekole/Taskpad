import { useState, useEffect } from "react";
import { UserAvatar } from "./components/UserAvatar";
import { AddTaskBar } from "./components/AddTaskBar";
import { TaskSection } from "./components/TaskSection";
import { CsvImportModal } from "./components/CsvImportModal";
import { useTasks } from "./hooks/useTasks";
import { API_BASE } from "./lib/utils";

function parseUserFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("user_id");
  const email = params.get("email");
  const name = params.get("name");
  return userId ? { userId, email, name } : null;
}

function loadStoredUser() {
  try {
    const raw = localStorage.getItem("task_app_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("done");
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    const fromUrl = parseUserFromUrl();
    if (fromUrl) {
      localStorage.setItem("task_app_user", JSON.stringify(fromUrl));
      setUser(fromUrl);
      window.history.replaceState({}, "", "/");
    } else {
      const stored = loadStoredUser();
      if (stored) setUser(stored);
    }
  }, []);

  const handleLogout = async () => {
    if (user) {
      await fetch(`${API_BASE}/api/auth/logout`).catch(() => {});
      localStorage.removeItem("task_app_user");
      setUser(null);
    }
  };

  const { tasks, loading, error, fetchTasks, createTask, updateTask, resetStale, reorder, deleteTask } =
    useTasks(user?.userId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-800 tracking-tight">Tasks</h1>
          <UserAvatar
            user={user}
            onLogout={handleLogout}
            onImport={() => setShowImport(true)}
          />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {!user ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg font-medium mb-2">Sign in to get started</p>
            <p className="text-sm">Connect your Google account to manage your tasks.</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
                {error}
              </div>
            )}

            {/* Active Tasks */}
            <section className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  Active Tasks
                  <span className="ml-2 text-gray-300 font-normal normal-case">
                    {tasks.active.length}
                  </span>
                </h2>
                <div className="flex items-center gap-2 text-xs text-gray-400 pr-1">
                  <span className="w-28 text-center">Due</span>
                  <span className="w-6 text-center">Cat.</span>
                  <span className="w-8 text-center">Stale</span>
                  <span className="w-5" />
                </div>
              </div>

              <AddTaskBar onAdd={createTask} />

              {loading ? (
                <p className="text-sm text-gray-300 italic px-1">Loading...</p>
              ) : (
                <TaskSection
                  tasks={tasks.active}
                  section="active"
                  onUpdate={updateTask}
                  onResetStale={resetStale}
                  onDelete={deleteTask}
                  onReorder={reorder}
                />
              )}
            </section>

            {/* Done / Backlog / Expired Tabs */}
            <section>
              <div className="flex border-b border-gray-200 mb-4">
                {["done", "backlog", "expired"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                      activeTab === tab
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    <span className="ml-1.5 text-xs text-gray-300">
                      {tasks[tab]?.length ?? 0}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end mb-1 pr-1">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="w-28 text-center">Due</span>
                  <span className="w-6 text-center">Cat.</span>
                  <span className="w-8 text-center">Stale</span>
                  <span className="w-5" />
                </div>
              </div>

              {loading ? (
                <p className="text-sm text-gray-300 italic px-1">Loading...</p>
              ) : (
                <TaskSection
                  tasks={tasks[activeTab] ?? []}
                  section={activeTab}
                  onUpdate={updateTask}
                  onResetStale={resetStale}
                  onDelete={deleteTask}
                  onReorder={reorder}
                />
              )}
            </section>
          </>
        )}
      </main>

      {showImport && (
        <CsvImportModal
          userId={user?.userId}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); fetchTasks(); }}
        />
      )}
    </div>
  );
}
