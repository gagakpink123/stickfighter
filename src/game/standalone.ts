import { inject } from '@vercel/analytics';
import { StickFighterController } from './controller';

if (
  typeof window !== 'undefined' &&
  (window.location.protocol === 'http:' || window.location.protocol === 'https:')
) {
  const host = window.location.hostname;
  const isLocalOrInternal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.run.app') ||
    host.endsWith('.cloudworkstations.dev');

  if (!isLocalOrInternal) {
    try {
      inject();
    } catch {
      // Graceful fallback for restricted/offline environments
    }
  }
}

function boot(): void {
  const root = document.getElementById('app') || document.getElementById('root');
  if (root) {
    const isHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    new StickFighterController(root, {
      enableOfflineDownload: isHttp,
      offlineHref: '/adnan-family-fighter.html',
    });
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
