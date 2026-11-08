import React, { memo, useEffect, useState } from 'react';

const PLAYER_TAG = 'dotlottie-wc';
const PLAYER_SCRIPT_URL = 'https://unpkg.com/@lottiefiles/dotlottie-wc@0.11.1/dist/dotlottie-wc.js';
const ANIMATION_URL = '/animations/admin-user-group-loading.lottie';
let playerLoadingPromise: Promise<void> | null = null;

function loadDotLottiePlayer(): Promise<void> {
  if (customElements.get(PLAYER_TAG)) return Promise.resolve();
  if (playerLoadingPromise) return playerLoadingPromise;

  console.log('[UserGroupLoading] Lottie player loading started');
  playerLoadingPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = PLAYER_SCRIPT_URL;
    script.onload = () => {
      customElements.whenDefined(PLAYER_TAG).then(() => {
        console.log('[UserGroupLoading] Lottie player ready');
        resolve();
      }).catch(reject);
    };
    script.onerror = () => reject(new Error('Lottie player could not be loaded'));
    document.head.appendChild(script);
  }).catch(error => {
    playerLoadingPromise = null;
    console.error('[UserGroupLoading] Lottie player failed to load:', error);
    throw error;
  });

  return playerLoadingPromise;
}

const DotLottiePlayer = PLAYER_TAG as unknown as React.ElementType;

const UserGroupLoading: React.FC = memo(() => {
  const [playerReady, setPlayerReady] = useState(() => Boolean(customElements.get(PLAYER_TAG)));

  useEffect(() => {
    let active = true;
    loadDotLottiePlayer().then(() => {
      if (active) setPlayerReady(true);
    }).catch(() => {
      // The pulse fallback remains visible when the Lottie player is unavailable.
    });
    return () => { active = false; };
  }, []);

  if (!playerReady) {
    return <span className="inline-block h-2 w-2 rounded-full bg-emerald-500/70 animate-pulse" aria-hidden="true" />;
  }

  return <DotLottiePlayer
    src={ANIMATION_URL}
    autoplay="true"
    loop="true"
    speed="0.65"
    aria-hidden="true"
    className="block h-6 w-6 shrink-0"
  />;
});

UserGroupLoading.displayName = 'UserGroupLoading';
export default UserGroupLoading;
