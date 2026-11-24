'use client';

import { useEffect } from 'react';
import { logError } from '@/lib/errorHandler';

const CHUNK_RELOAD_KEY = 'chunk-reload-attempted';

function isChunkLoadError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes('chunk') ||
    lower.includes('loading css chunk') ||
    lower.includes('loading chunk') ||
    lower.includes('dynamically imported module')
  );
}

async function hardReloadWithCacheReset() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // クリアに失敗しても最終的にリロードは実行する
  }

  window.location.reload();
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const message = error?.message ?? '';
    logError(error, 'app/error');
    if (!isChunkLoadError(message)) return;

    const alreadyAttempted = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
    if (alreadyAttempted) {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return;
    }

    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    void hardReloadWithCacheReset();
  }, [error]);

  const handleRetry = () => {
    const message = error?.message ?? '';
    if (isChunkLoadError(message)) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
      void hardReloadWithCacheReset();
      return;
    }
    reset();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <p className="text-6xl" role="img" aria-label="crayfish">
        🦞
      </p>

      <h1 className="mt-6 text-2xl font-bold text-gray-800">
        エラーが発生しました
      </h1>

      <p className="mt-2 max-w-md text-gray-600">
        申し訳ありません。予期せぬ問題が発生しました。もう一度お試しください。
      </p>

      {error.digest && (
        <p className="mt-1 text-xs text-gray-400">エラーID: {error.digest}</p>
      )}

      <div className="mt-8 flex gap-4">
        <button
          onClick={handleRetry}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          再試行
        </button>

        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Error boundary needs full page reload */}
        <a
          href="/"
          className="rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          ホームに戻る
        </a>
      </div>
    </div>
  );
}
