import { open as openExternal } from "@tauri-apps/plugin-shell";
import { tauri, type UpdateInfo } from "../lib/tauri";

interface Props {
  info: UpdateInfo;
  /** Dismiss for this session only — will reappear next launch. */
  onClose: () => void;
  /** Dismiss permanently for this version — won't nag until a newer one. */
  onSkip: () => void;
}

export function UpdateNotification({ info, onClose, onSkip }: Props) {
  const openDownload = async () => {
    if (info.download_url) {
      try {
        await openExternal(info.download_url);
      } catch {
        /* user can copy URL if it fails */
      }
    }
  };

  const skip = async () => {
    try {
      await tauri.setSkippedUpdateVersion(info.latest_version);
    } catch {
      /* swallow — UI still dismisses */
    }
    onSkip();
  };

  return (
    <div className="update-toast" role="dialog" aria-label="Update available">
      <button
        type="button"
        className="update-toast-close"
        onClick={onClose}
        aria-label="Dismiss for this session"
        title="Dismiss (will reappear next launch)"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 2l8 8M10 2l-8 8"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div className="update-toast-title">
        Signet {info.latest_version} is available
      </div>
      <div className="update-toast-sub">
        You're on {info.current_version}.
      </div>
      {info.notes && (
        <div className="update-toast-notes">{info.notes}</div>
      )}
      <div className="update-toast-actions">
        {info.download_url && (
          <button
            type="button"
            className="btn-primary update-toast-btn"
            onClick={openDownload}
          >
            Download
          </button>
        )}
        <button
          type="button"
          className="update-toast-link"
          onClick={skip}
        >
          Skip this version
        </button>
      </div>
    </div>
  );
}
