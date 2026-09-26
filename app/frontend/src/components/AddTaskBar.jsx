import { useState } from "react";
import { Plus } from "lucide-react";
import { CategoryPicker } from "./CategoryDot";

export function AddTaskBar({ onAdd }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("gray");
  const [dueDate, setDueDate] = useState("");

  const handleAdd = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed, category, dueDate);
    setTitle("");
    setCategory("gray");
    setDueDate("");
  };

  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 mb-4">
      <input
        type="text"
        placeholder="Add a new task..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        className="flex-1 text-sm outline-none placeholder:text-gray-300"
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="text-xs text-gray-400 border border-gray-100 rounded px-2 py-1 outline-none"
        title="Due date (optional)"
      />
      <CategoryPicker value={category} onChange={setCategory} />
      <button
        onClick={handleAdd}
        className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
      >
        <Plus size={15} />
        Add
      </button>
    </div>
  );
}
