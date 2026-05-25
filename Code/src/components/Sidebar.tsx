import { CATEGORY_LIST, type CategoryKey } from "../lib/categories";
import type { CompletenessSlice } from "../lib/completeness";
import type { BrowserView } from "../store/vaultStore";
import { CompletionBar } from "./CompletionBar";
import { CATEGORY_ICONS, ICONS } from "../lib/icons";

interface Props {
  view: BrowserView;
  countByCategory: Record<CategoryKey, number>;
  totalCount: number;
  beneficiaryCount: number;
  score: number;
  suggestionsRemaining: number;
  completenessSlices?: CompletenessSlice[];
  onSelectView: (view: BrowserView) => void;
  onLock: () => void;
}

export function Sidebar({
  view,
  countByCategory,
  totalCount,
  beneficiaryCount,
  score,
  suggestionsRemaining,
  completenessSlices,
  onSelectView,
  onLock,
}: Props) {
  return (
    <div className="sidebar">
      <div className="sb-section">
        <div className="sb-label">Vault</div>
        <SidebarItem
          label="My vault"
          icon={ICONS.myvault}
          badge={totalCount}
          active={view === "all"}
          onClick={() => onSelectView("all")}
        />
        <SidebarItem
          label="Beneficiaries"
          icon={ICONS.beneficiaries}
          badge={beneficiaryCount}
          active={view === "beneficiaries"}
          onClick={() => onSelectView("beneficiaries")}
        />
        <SidebarItem
          label="Recovery cards"
          icon={ICONS.recoverycards}
          active={view === "recovery"}
          onClick={() => onSelectView("recovery")}
        />
        <SidebarItem
          label="Settings"
          icon={ICONS.settings}
          active={view === "settings"}
          onClick={() => onSelectView("settings")}
        />
      </div>

      <div className="sb-section">
        <div className="sb-label">Categories</div>
        {CATEGORY_LIST.map((c) => (
          <SidebarItem
            key={c.key}
            label={c.label}
            icon={CATEGORY_ICONS[c.key]}
            badge={countByCategory[c.key]}
            active={view === c.key}
            onClick={() => onSelectView(c.key)}
          />
        ))}
      </div>

      <div className="sb-footer">
        <button
          type="button"
          className="sb-lock-btn"
          onClick={onLock}
          title="Lock vault and return to the password screen"
        >
          <img src={ICONS.myvault} alt="" className="sb-lock-icon-img" />
          <span>Lock vault</span>
        </button>
        <CompletionBar
          score={score}
          remaining={suggestionsRemaining}
          slices={completenessSlices}
        />
      </div>
    </div>
  );
}

interface ItemProps {
  label: string;
  icon: string;
  badge?: number;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}

function SidebarItem({
  label,
  icon,
  badge,
  active,
  disabled,
  title,
  onClick,
}: ItemProps) {
  return (
    <button
      type="button"
      className={
        "nav" + (active ? " nav-active" : "") + (disabled ? " nav-disabled" : "")
      }
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
    >
      <img src={icon} alt="" className="nav-icon-img" />
      <span className="nav-label">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="nav-badge">{badge}</span>
      )}
    </button>
  );
}
