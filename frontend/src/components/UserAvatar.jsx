import { useState, useRef, useEffect } from "react";
import { LogOut, User, Upload, ChevronDown } from "lucide-react";
import { API_BASE } from "../lib/utils";

export function UserAvatar({ user, onLogout, onImport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  if (!user) {
    return (
      <a
        href={`${API_BASE}/api/auth/login`}
        className="flex items-center gap-2 text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors shadow-sm"
      >
        <User size={16} className="text-gray-500" />
        Sign in with Google
      </a>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-1.5 shadow-sm hover:bg-gray-50 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-semibold uppercase">
          {user.name?.[0] || user.email?.[0] || "?"}
        </div>
        <span className="text-sm text-gray-700 hidden sm:block">{user.name || user.email}</span>
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-100 rounded-lg shadow-lg py-1 z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-700 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => { setOpen(false); onImport(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Upload size={14} />
            Import CSV
          </button>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
