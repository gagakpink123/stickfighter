import { CharacterId } from './types';

export const FACE_MASK_STORAGE_KEY = 'aff_face_mask';
export const DEFAULT_FACE_MASK_ENABLED = true;

export const FACE_MASK_PATHS: Record<CharacterId, string> = {
  adnan: '/assets/aistudio/Ayah_Adnan_fabd0a5b.png',
  tika: '/assets/aistudio/Ibu_TIka_4d5a6b7c.png',
  dhira: '/assets/aistudio/Kak_Dhira_4ca87974.png',
  iyen: '/assets/aistudio/Dik_Iyen_5d7e9c6f.png',
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readFaceMaskSetting(storage?: StorageLike | null): boolean {
  if (!storage) return DEFAULT_FACE_MASK_ENABLED;
  try {
    const raw = storage.getItem(FACE_MASK_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    return DEFAULT_FACE_MASK_ENABLED;
  } catch {
    return DEFAULT_FACE_MASK_ENABLED;
  }
}

export function writeFaceMaskSetting(storage: StorageLike | null | undefined, enabled: boolean): void {
  if (!storage) return;
  try {
    storage.setItem(FACE_MASK_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export interface HudFacePortraitSpec {
  charId: CharacterId;
  src: string;
}

export function getHudFacePortraitSpec(
  charId: CharacterId,
  faceMaskEnabled: boolean,
  overrideSrc?: string | null
): HudFacePortraitSpec | null {
  if (!faceMaskEnabled) return null;
  const src =
    typeof overrideSrc === 'string' && overrideSrc.startsWith('data:image/')
      ? overrideSrc
      : FACE_MASK_PATHS[charId];
  return {
    charId,
    src,
  };
}

export function buildHudOvalFrameSvg(slot: 1 | 2): string {
  return `
    <svg class="sf-hud-portrait-ornament" data-slot="${slot}" viewBox="0 0 100 120" aria-hidden="true">
      <!-- Outer black ink contour & white base oval molding -->
      <ellipse cx="50" cy="62" rx="42.2" ry="49.7" fill="none" stroke="#111111" stroke-width="8.4" />
      <ellipse cx="50" cy="62" rx="41.6" ry="49.1" fill="none" stroke="#FFFFFF" stroke-width="5.6" />
      <ellipse cx="50" cy="62" rx="39.6" ry="47.2" fill="none" stroke="#111111" stroke-width="1.35" stroke-dasharray="0.2 3.7" stroke-linecap="round" />
      <ellipse cx="50" cy="62" rx="37.1" ry="45" fill="none" stroke="#FF0000" stroke-width="1.15" />
      <ellipse cx="50" cy="62" rx="35.8" ry="43.8" fill="none" stroke="#111111" stroke-width="1.6" />

      <!-- Diagonal baroque corner leaf flourishes (white base + black lines + red dot tips) -->
      <path d="M 18 27 C 13 22, 14 16, 20 17 C 23 17.5, 25 21, 22 24" fill="none" stroke="#111111" stroke-width="3.8" stroke-linecap="round" />
      <path d="M 18 27 C 13 22, 14 16, 20 17 C 23 17.5, 25 21, 22 24" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="15.5" cy="19.5" r="1.25" fill="#FF0000" stroke="#111111" stroke-width="0.6" />

      <path d="M 82 27 C 87 22, 86 16, 80 17 C 77 17.5, 75 21, 78 24" fill="none" stroke="#111111" stroke-width="3.8" stroke-linecap="round" />
      <path d="M 82 27 C 87 22, 86 16, 80 17 C 77 17.5, 75 21, 78 24" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="84.5" cy="19.5" r="1.25" fill="#FF0000" stroke="#111111" stroke-width="0.6" />

      <path d="M 18 97 C 13 102, 14 108, 20 107 C 23 106.5, 25 103, 22 100" fill="none" stroke="#111111" stroke-width="3.8" stroke-linecap="round" />
      <path d="M 18 97 C 13 102, 14 108, 20 107 C 23 106.5, 25 103, 22 100" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="15.5" cy="104.5" r="1.25" fill="#FF0000" stroke="#111111" stroke-width="0.6" />

      <path d="M 82 97 C 87 102, 86 108, 80 107 C 77 106.5, 75 103, 78 100" fill="none" stroke="#111111" stroke-width="3.8" stroke-linecap="round" />
      <path d="M 82 97 C 87 102, 86 108, 80 107 C 77 106.5, 75 103, 78 100" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="84.5" cy="104.5" r="1.25" fill="#FF0000" stroke="#111111" stroke-width="0.6" />

      <!-- Side filigree acanthus ears (3 & 9 o'clock) -->
      <path d="M 10 49 C 3.5 51, 3 57.5, 7.5 60 C 3.5 62, 3.5 65.5, 7.5 67.5 C 3 70, 3.5 76, 10 77.5" fill="none" stroke="#111111" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M 10 49 C 3.5 51, 3 57.5, 7.5 60 C 3.5 62, 3.5 65.5, 7.5 67.5 C 3 70, 3.5 76, 10 77.5" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="5.6" cy="63.5" r="2.2" fill="#FF0000" stroke="#111111" stroke-width="1" />

      <path d="M 90 49 C 96.5 51, 97 57.5, 92.5 60 C 96.5 62, 96.5 65.5, 92.5 67.5 C 97 70, 96.5 76, 90 77.5" fill="none" stroke="#111111" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M 90 49 C 96.5 51, 97 57.5, 92.5 60 C 96.5 62, 96.5 65.5, 92.5 67.5 C 97 70, 96.5 76, 90 77.5" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="94.4" cy="63.5" r="2.2" fill="#FF0000" stroke="#111111" stroke-width="1" />

      <!-- Top classical crown crest & scrollwork -->
      <path d="M 50 13.5 C 43 13.5, 38 7, 31.5 10 C 27 12.2, 29 17.5, 34 17 C 37 16.7, 37.5 13.8, 34.5 13.3" fill="none" stroke="#111111" stroke-width="4.4" stroke-linecap="round" />
      <path d="M 50 13.5 C 43 13.5, 38 7, 31.5 10 C 27 12.2, 29 17.5, 34 17 C 37 16.7, 37.5 13.8, 34.5 13.3" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" />
      <path d="M 50 13.5 C 57 13.5, 62 7, 68.5 10 C 73 12.2, 71 17.5, 66 17 C 63 16.7, 62.5 13.8, 65.5 13.3" fill="none" stroke="#111111" stroke-width="4.4" stroke-linecap="round" />
      <path d="M 50 13.5 C 57 13.5, 62 7, 68.5 10 C 73 12.2, 71 17.5, 66 17 C 63 16.7, 62.5 13.8, 65.5 13.3" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" />
      <path d="M 50 1.5 C 53.6 5.5, 57.5 8.5, 55.8 14.5 L 50 17.6 L 44.2 14.5 C 42.5 8.5, 46.4 5.5, 50 1.5 Z" fill="#FFFFFF" stroke="#111111" stroke-width="1.5" stroke-linejoin="round" />
      <circle cx="50" cy="10.4" r="2.7" fill="#FF0000" stroke="#111111" stroke-width="1" />

      <!-- Bottom finial clasp & pendant -->
      <path d="M 35 107.5 C 39.5 113, 45.5 112.5, 50 109.5 C 54.5 112.5, 60.5 113, 65 107.5" fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round" />
      <path d="M 35 107.5 C 39.5 113, 45.5 112.5, 50 109.5 C 54.5 112.5, 60.5 113, 65 107.5" fill="none" stroke="#FFFFFF" stroke-width="1.9" stroke-linecap="round" />
      <path d="M 50 105.5 L 54.6 111.5 L 50 118.5 L 45.4 111.5 Z" fill="#FFFFFF" stroke="#111111" stroke-width="1.45" stroke-linejoin="round" />
      <circle cx="50" cy="111.5" r="1.85" fill="#FF0000" stroke="#111111" stroke-width="0.8" />
    </svg>
  `;
}
