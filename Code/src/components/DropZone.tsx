import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { CategoryKey } from "../lib/categories";

interface Props {
  category: CategoryKey;
  onDrop: (path: string) => Promise<void> | void;
  busy?: boolean;
}

export function DropZone({ onDrop, busy }: Props) {
  const [hover, setHover] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent(async (event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setHover(true);
        } else if (payload.type === "leave") {
          setHover(false);
        } else if (payload.type === "drop") {
          setHover(false);
          for (const path of payload.paths) {
            try {
              await onDropRef.current(path);
            } catch {
              /* surfaced via parent */
            }
          }
        }
      })
      .then((u) => {
        if (cancelled) u();
        else unlisten = u;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const cls = [
    "drop",
    hover ? "drop-hover" : "",
    busy ? "drop-busy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      {busy
        ? "Encrypting and adding to vault…"
        : "Drop a file or folder here to encrypt and add to vault"}
    </div>
  );
}
