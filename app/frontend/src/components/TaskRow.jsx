import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ChevronDown, Check, Trash2 } from "lucide-react";
import { CategoryDot, CategoryPicker } from "./CategoryDot";
import { CATEGORY_COLORS } from "../lib/utils";

const STATUS_MOVE_OPTIONS = {
  active: [{ label: "Move to Backlog", value: "backlog" }, { label: "Move to Expired", value: "expired" }],
  done: [{ label: "Move to Active", value: "active" }, { label: "Move to Backlog", value: "backlog" }, { label: "Move to Expired", value: "expired" }],
  backlog: [{ label: "Move to Active", value: "active" }, { label: "Move to Expired", value: "expired" }],
  expired: [{ label: "Move to Active", value: "active" }, { label: "Move to Backlog", value: "backlog" }, { label: "Move to Done", value: "done" }],
};

export function TaskRow({ task, section, onUpdate, onResetStale, onDelete }) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showStaleMenu, setShowStaleMenu] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [editingDueDate, setEditingDueDate] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isDone = section === "done";
  const { bg } = CATEGORY_COLORS[task.category] || CATEGORY_COLORS.gray;

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (titleValue !== task.title) onUpdate(task.id, { title: titleValue });
  };

  const handleDueDateChange = (e) => {
    onUpdate(task.id, { due_date: e.target.value });
    setEditingDueDate(false);
  };

  const toggleDone = () => {
    onUpdate(task.id, { status: isDone ? "active" : "done" });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 bg-white rounded-lg border border-gray-100 shadow-sm px-3 py-2.5 group hover:shadow-md transition-shadow ${
        isDragging ? "shadow-lg" : ""
      }`}
    >
      {/* Drag handle */}
      <button
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

      {/* Checkbox */}
      <button
        onClick={toggleDone}
        className={`shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
          isDone
            ? "bg-gray-400 border-gray-400 text-white"
            : "border-gray-300 hover:border-gray-400"
        }`}
      >
        {isDone && <Check size={13} strokeWidth={3} />}
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        {editingTitle ? (
          <textarea
            className="w-full text-sm resize-none border-0 outline-none bg-transparent leading-snug"
            value={titleValue}
            rows={2}
            autoFocus
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTitleBlur(); } }}
          />
        ) : (
          <p
            className={`text-sm leading-snug cursor-text line-clamp-2 ${isDone ? "line-through text-gray-400" : "text-gray-800"}`}
            onClick={() => setEditingTitle(true)}
          >
            {task.title || <span className="text-gray-300 italic">Untitled</span>}
          </p>
        )}
      </div>

      {/* Due date */}
      <div className="shrink-0 w-28">
        {editingDueDate ? (
          <input
            type="date"
            className="text-xs border border-gray-200 rounded px-1 py-0.5 w-full"
            defaultValue={task.due_date}
            autoFocus
            onChange={handleDueDateChange}
            onBlur={() => setEditingDueDate(false)}
          />
        ) : (
          <button
            onClick={() => setEditingDueDate(true)}
            className="text-xs text-gray-400 hover:text-gray-600 w-full text-left truncate"
          >
            {task.due_date || <span className="italic">No due date</span>}
          </button>
        )}
      </div>

      {/* Category */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowCategoryPicker((v) => !v)}
          className={`w-6 h-6 rounded ${bg} hover:opacity-80 transition-opacity`}
          title="Category"
        />
        {showCategoryPicker && (
          <div className="absolute z-20 right-0 top-8 bg-white border border-gray-100 rounded-lg shadow-lg p-2">
            <CategoryPicker
              value={task.category}
              onChange={(cat) => {
                onUpdate(task.id, { category: cat });
                setShowCategoryPicker(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Days stale */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowStaleMenu((v) => !v)}
          title="Click to manage stale"
          className={`w-8 text-center text-xs font-semibold rounded px-1 py-0.5 transition-colors ${
            task.never_stale
              ? "bg-gray-100 text-gray-400 hover:bg-gray-200"
              : task.days_stale >= 5
              ? "bg-red-100 text-red-600 hover:bg-red-200"
              : task.days_stale >= 3
              ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {task.never_stale ? "—" : task.days_stale}
        </button>
        {showStaleMenu && (
          <div className="absolute z-20 right-0 top-7 bg-white border border-gray-100 rounded-lg shadow-lg py-1 min-w-32">
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => { onUpdate(task.id, { never_stale: false }); setShowStaleMenu(false); }}
            >
              Reset
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => { onUpdate(task.id, { never_stale: true }); setShowStaleMenu(false); }}
            >
              Never Stale
            </button>
          </div>
        )}
      </div>

      {/* Move dropdown */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowMoveMenu((v) => !v)}
          className="text-gray-300 hover:text-gray-600 transition-colors"
          title="Move task"
        >
          <ChevronDown size={18} />
        </button>
        {showMoveMenu && (
          <div className="absolute z-20 right-0 top-7 bg-white border border-gray-100 rounded-lg shadow-lg py-1 min-w-36">
            {(STATUS_MOVE_OPTIONS[section] || []).map((opt) => (
              <button
                key={opt.value}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => { onUpdate(task.id, { status: opt.value }); setShowMoveMenu(false); }}
              >
                {opt.label}
              </button>
            ))}
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 flex items-center gap-1.5"
              onClick={() => { onDelete(task.id); setShowMoveMenu(false); }}
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
