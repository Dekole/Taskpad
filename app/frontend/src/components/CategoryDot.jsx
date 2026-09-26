import { CATEGORY_COLORS } from "../lib/utils";

const CATEGORIES = ["gray", "green", "yellow", "red"];

export function CategoryDot({ value }) {
  const { bg } = CATEGORY_COLORS[value] || CATEGORY_COLORS.gray;
  return <span className={`inline-block w-4 h-4 rounded-full ${bg}`} />;
}

export function CategoryPicker({ value, onChange }) {
  return (
    <div className="flex gap-1.5 items-center">
      {CATEGORIES.map((cat) => {
        const { bg, ring } = CATEGORY_COLORS[cat];
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            className={`w-5 h-5 rounded-full ${bg} transition-all ${
              value === cat ? `ring-2 ring-offset-1 ${ring} scale-110` : "hover:scale-110"
            }`}
            title={CATEGORY_COLORS[cat].label}
          />
        );
      })}
    </div>
  );
}
