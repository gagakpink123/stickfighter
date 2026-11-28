/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useRef } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { StickFighterController } from './game/controller';

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const controller = new StickFighterController(el, {
      enableOfflineDownload: true,
      offlineHref: '/adnan-family-fighter.html',
    });
    return () => {
      controller.destroy();
    };
  }, []);

  const isLocalOrInternal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.run.app') ||
      window.location.hostname.endsWith('.cloudworkstations.dev'));

  return (
    <>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#FFFFFF' }} />
      {!isLocalOrInternal && <Analytics />}
    </>
  );
}
