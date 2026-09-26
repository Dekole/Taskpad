import { Clock, SplitSquareVertical, Monitor } from "lucide-react";
import { API_BASE } from "../lib/utils";

const GITHUB_URL = "https://github.com/Dekole/Taskpad";
const LINKEDIN_URL = "https://www.linkedin.com/in/peter-chen-5832a721/";

const features = [
  {
    icon: Clock,
    title: "Tasks expire automatically",
    body: "Tasks that go untouched for too long move to Expired on their own. Your active list stays focused without any manual cleanup.",
  },
  {
    icon: SplitSquareVertical,
    title: "Done and Expired are different",
    body: "Tasks you completed live in Done. Tasks you abandoned live in Expired. See an honest picture of both — not just what went right.",
  },
  {
    icon: Monitor,
    title: "Just a website",
    body: "No app to install. No push notifications. Open a tab, manage your tasks, and close it. That's it.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <p className="text-xs font-semibold tracking-widest text-blue-500 uppercase mb-4">
          Task Management — Simplified
        </p>
        <h2 className="text-4xl font-bold text-gray-900 tracking-tight mb-5 max-w-xl leading-tight">
          A task list that keeps itself clean.
        </h2>
        <p className="text-gray-500 text-base max-w-md mb-10 leading-relaxed">
          Most task apps let clutter accumulate for years. Taskpad automatically
          expires stale tasks so your list reflects what actually matters.
        </p>
        <a
          href={`${API_BASE}/api/auth/login`}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-6 py-3 transition-colors shadow-sm"
        >
          Sign in with Google
        </a>

        {/* Feature Cards */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-3xl text-left">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                <Icon size={20} className="text-blue-500" />
              </div>
              <p className="text-sm font-semibold text-gray-800 mb-2">{title}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Peter Chen &middot; React &middot; FastAPI &middot; PostgreSQL &middot; Docker
          </p>
          <div className="flex items-center gap-5 text-xs text-gray-400">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700 transition-colors"
            >
              GitHub
            </a>
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700 transition-colors"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
