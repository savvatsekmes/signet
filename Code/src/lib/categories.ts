export type CategoryKey =
  | "documents"
  | "passwords"
  | "crypto"
  | "personal"
  | "images";

export interface CategoryDef {
  key: CategoryKey;
  label: string;
  short: string;
  bg: string;
  fg: string;
  countNoun: string;
}

export const CATEGORIES: Record<CategoryKey, CategoryDef> = {
  documents: {
    key: "documents",
    label: "Documents",
    short: "Document",
    bg: "#FAECE7",
    fg: "#712B13",
    countNoun: "files",
  },
  passwords: {
    key: "passwords",
    label: "Passwords",
    short: "Password",
    bg: "#EEEDFE",
    fg: "#3C3489",
    countNoun: "entries",
  },
  crypto: {
    key: "crypto",
    label: "Crypto seeds",
    short: "Crypto",
    bg: "#EAF3DE",
    fg: "#27500A",
    countNoun: "wallets",
  },
  personal: {
    key: "personal",
    label: "Personal",
    short: "Personal",
    bg: "#FBEAF0",
    fg: "#72243E",
    countNoun: "messages",
  },
  images: {
    key: "images",
    label: "Images",
    short: "Image",
    bg: "#E5EBF7",
    fg: "#3F4E73",
    countNoun: "photos",
  },
};

export const CATEGORY_LIST: CategoryDef[] = [
  CATEGORIES.documents,
  CATEGORIES.passwords,
  CATEGORIES.crypto,
  CATEGORIES.personal,
  CATEGORIES.images,
];

export function categoryFor(key: string): CategoryDef | undefined {
  if (key in CATEGORIES) return CATEGORIES[key as CategoryKey];
  return undefined;
}

const EXT_TO_CATEGORY: Record<string, CategoryKey> = {
  // Images
  png: "images",
  jpg: "images",
  jpeg: "images",
  gif: "images",
  webp: "images",
  heic: "images",
  heif: "images",
  bmp: "images",
  tif: "images",
  tiff: "images",
  svg: "images",
  avif: "images",
  // Documents
  pdf: "documents",
  doc: "documents",
  docx: "documents",
  odt: "documents",
  rtf: "documents",
  txt: "documents",
  md: "documents",
  pages: "documents",
  // Personal (letters / messages — text-ish but explicitly personal)
  // (left out — let the picker decide)
};

/**
 * Infer a category from a filename based on extension.
 * Returns undefined if the extension is unknown — caller should fall back to
 * the user's picker selection.
 */
export function inferCategoryFromFilename(
  filename: string
): CategoryKey | undefined {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0 || lastDot === filename.length - 1) return undefined;
  const ext = filename.slice(lastDot + 1).toLowerCase();
  return EXT_TO_CATEGORY[ext];
}

export function basenameFromPath(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.slice(idx + 1) : path;
}
