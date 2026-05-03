import type { CategoryDef } from "../lib/categories";
import { CATEGORY_ICONS } from "../lib/icons";

interface Props {
  category: CategoryDef;
  count: number;
  active?: boolean;
  onClick?: () => void;
}

export function CategoryCard({ category, count, active, onClick }: Props) {
  const icon = CATEGORY_ICONS[category.key];
  return (
    <button
      type="button"
      className={"cat" + (active ? " cat-active" : "")}
      onClick={onClick}
    >
      <div className="cat-icon" style={{ background: category.bg }}>
        {icon && <img src={icon} alt="" className="cat-icon-img" />}
      </div>
      <div className="cat-name">{category.label}</div>
      <div className="cat-count">
        {count} {count === 1 ? singular(category.countNoun) : category.countNoun}
      </div>
    </button>
  );
}

function singular(noun: string): string {
  if (noun.endsWith("s")) return noun.slice(0, -1);
  return noun;
}
