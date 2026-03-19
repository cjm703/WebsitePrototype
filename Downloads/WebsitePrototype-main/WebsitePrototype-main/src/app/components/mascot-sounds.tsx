// Shared mascot/character sound effect utility
// Plays a random sound from the provided Google Drive audio files
// Cache-bust v3

const SOUND_URLS = [
  "https://drive.google.com/uc?export=download&id=1bilWmII__C5XTzDLodPwxi-R78iRfYCg",
  "https://drive.google.com/uc?export=download&id=1sN68eQhumXzhORYFXWtCUnCmDE2NF5G9",
  "https://drive.google.com/uc?export=download&id=1lET69HlC16Sw67Vzv1_1RPn8wbO3Crsy",
];

// Pre-cached Audio elements for instant playback
let cachedAudios: HTMLAudioElement[] | null = null;

function ensureCached(): HTMLAudioElement[] {
  if (!cachedAudios) {
    cachedAudios = SOUND_URLS.map((url) => {
      const a = new Audio(url);
      a.preload = "auto";
      a.volume = 0.6;
      return a;
    });
  }
  return cachedAudios;
}

export function playRandomMascotSound() {
  try {
    const audios = ensureCached();
    const picked = audios[Math.floor(Math.random() * audios.length)];
    // Clone so overlapping plays are allowed
    const clone = picked.cloneNode(true) as HTMLAudioElement;
    clone.volume = 0.6;
    clone.play().catch(() => {
      // Autoplay may be blocked — ignore silently
    });
  } catch {
    // Fail silently
  }
}