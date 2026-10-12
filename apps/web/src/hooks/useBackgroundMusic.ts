import { useEffect, useRef, useState } from 'react';

// Music is optional and never committed: drop an mp3 you have the rights to into media/
// (gitignored). The first one alphabetically plays; with none, the sound button is hidden.
const tracks = import.meta.glob<string>('../../../../media/*.mp3', { eager: true, query: '?url', import: 'default' });
const musicUrl = Object.keys(tracks)
  .sort()
  .map((k) => tracks[k])[0];

const STORAGE_KEY = 'aj:sound';
const VOLUME = 0.35;

/**
 * Looping background music with an on/off preference saved per browser.
 * Browsers block audio until the user interacts with the page, so when sound is on
 * but autoplay is refused, playback starts on the first click or key press.
 */
export function useBackgroundMusic() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) !== 'off');
  const audioRef = useRef<HTMLAudioElement>();

  useEffect(() => {
    if (!musicUrl) return;
    const audio = new Audio(musicUrl);
    audio.loop = true;
    audio.volume = VOLUME;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    const audio = audioRef.current;
    if (!audio) return;
    if (!enabled) {
      audio.pause();
      return;
    }

    const start = () => void audio.play().catch(() => {});
    const unlock = () => {
      start();
      removeUnlock();
    };
    const removeUnlock = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };

    audio.play().catch(() => {
      // Autoplay refused: wait for the first interaction.
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
    });
    return removeUnlock;
  }, [enabled]);

  return { available: Boolean(musicUrl), enabled, toggle: () => setEnabled((on) => !on) };
}
