import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import logoUrl from "../assets/signet-logo.png";

function MarkLogo() {
  return (
    <div className="titlebar-mark">
      <img src={logoUrl} alt="" className="titlebar-mark-img" />
    </div>
  );
}

function MinimizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="1" y="4.5" width="8" height="1" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect
        x="1.5"
        y="1.5"
        width="7"
        height="7"
        rx="1"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M2 2l6 6M8 2l-6 6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface Props {
  rightSlot?: React.ReactNode;
}

export function Titlebar({ rightSlot }: Props) {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    try {
      setIsMac(platform() === "macos");
    } catch {
      setIsMac(false);
    }
  }, []);

  const w = getCurrentWindow();

  const minimize = () => w.minimize();
  const toggleMaximize = () => w.toggleMaximize();
  const close = () => w.close();

  const windowsControls = (
    <div className="titlebar-controls">
      <button
        className="titlebar-btn"
        onClick={minimize}
        aria-label="Minimize"
      >
        <MinimizeIcon />
      </button>
      <button
        className="titlebar-btn"
        onClick={toggleMaximize}
        aria-label="Maximize"
      >
        <MaximizeIcon />
      </button>
      <button
        className="titlebar-btn close"
        onClick={close}
        aria-label="Close"
      >
        <CloseIcon />
      </button>
    </div>
  );

  const macControls = (
    <div className="titlebar-mac-controls">
      <button
        className="titlebar-mac-btn close"
        onClick={close}
        aria-label="Close"
      />
      <button
        className="titlebar-mac-btn minimize"
        onClick={minimize}
        aria-label="Minimize"
      />
      <button
        className="titlebar-mac-btn maximize"
        onClick={toggleMaximize}
        aria-label="Maximize"
      />
    </div>
  );

  return (
    <div className="titlebar" data-tauri-drag-region>
      {isMac && macControls}
      <div className="titlebar-logo" data-tauri-drag-region>
        <MarkLogo />
        <div className="titlebar-name" data-tauri-drag-region>
          Signet
        </div>
      </div>
      <div className="titlebar-spacer" data-tauri-drag-region />
      {rightSlot}
      {!isMac && windowsControls}
    </div>
  );
}
