import myvault from "../assets/icons/myvault.png";
import beneficiaries from "../assets/icons/beneficiaries.png";
import recoverycards from "../assets/icons/recoverycards.png";
import settings from "../assets/icons/settings.png";
import documents from "../assets/icons/documents.png";
import passwords from "../assets/icons/passwords.png";
import cryptoseeds from "../assets/icons/cryptoseeds.png";
import personal from "../assets/icons/personal.png";
import images from "../assets/icons/images.png";

export const ICONS = {
  myvault,
  beneficiaries,
  recoverycards,
  settings,
  documents,
  passwords,
  cryptoseeds,
  personal,
  images,
} as const;

export type IconName = keyof typeof ICONS;

/** Map a category key (matches CategoryKey) to its glyph. */
export const CATEGORY_ICONS: Record<string, string> = {
  documents,
  passwords,
  crypto: cryptoseeds,
  personal,
  images,
};
