import { MetadataRoute } from 'next'

// REQ-237: Web Push は VAPID 方式（applicationServerKey）で動作するため、PWA manifest に
// `gcm_sender_id` は不要（レガシー GCM 専用フィールド）。通知アイコンは既存 icon-192.png を
// Service Worker の push ハンドラ（public/sw.js.tpl）が icon/badge に使う。manifest 追加変更なし。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ザリダス - 秋田県外来生物情報マップ',
    short_name: 'ザリダス',
    description: '秋田県外来生物出没・分布情報マップ。アメリカザリガニやウシガエルの目撃・捕獲情報をリアルタイムで共有。',
    theme_color: '#dc2626',
    background_color: '#ffffff',
    display: 'standalone',
    orientation: 'any',
    start_url: '/',
    scope: '/',
    lang: 'ja',
    dir: 'ltr',
    categories: ['education', 'utilities'],
    prefer_related_applications: false,
    icons: [
      // REQ-199 FR-199-06: 一部 Android/PWA 環境は SVG 非対応のため PNG を併記。
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: '/icon-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
      {
        src: '/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: '投稿する',
        url: '/?action=post',
        icons: [{ src: '/icon-192.svg', sizes: '192x192' }],
      },
      {
        name: 'マイページ',
        url: '/dashboard',
        icons: [{ src: '/icon-192.svg', sizes: '192x192' }],
      },
    ],
  }
}
