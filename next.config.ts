import type { NextConfig } from 'next'
import type { webpack as Webpack } from 'next/dist/compiled/webpack/webpack'
import bundleAnalyzer from '@next/bundle-analyzer'
// @sentry/nextjs 11 でビルド設定用の withSentryConfig は '/config' へ分かれた。
import { withSentryConfig } from '@sentry/nextjs/config'


const APP_BUILD_MANIFEST_PLUGIN = 'AppBuildManifestCompatPlugin'

// Next.js 16 で廃止された app-build-manifest.json を、既存のルート別性能予算のために再生成する。
// Next.js 15 の公式 AppBuildManifestPlugin と同じく、main-app と各 app entrypoint の初期資産を列挙する。
class AppBuildManifestCompatPlugin {
  apply(compiler: Webpack.Compiler) {
    compiler.hooks.make.tap(APP_BUILD_MANIFEST_PLUGIN, (compilation: Webpack.Compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: APP_BUILD_MANIFEST_PLUGIN,
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        () => {
          const entrypointFiles = (entrypoint: { getFiles(): string[] } | undefined) =>
            entrypoint?.getFiles()
              .filter(file => /(?<!\.hot-update)\.(js|css)($|\?)/.test(file))
              .map(file => file.replace(/\\/g, '/')) ?? []
          const mainFiles = entrypointFiles(compilation.entrypoints.get('main-app'))
          const pages: Record<string, string[]> = {}

          for (const entrypoint of compilation.entrypoints.values()) {
            const match = entrypoint.name?.match(/^app[/\\](.*)$/)
            if (!match?.[1]) continue
            pages[`/${match[1]}`] = [
              ...new Set([...mainFiles, ...entrypointFiles(entrypoint)]),
            ]
          }

          compilation.emitAsset(
            'app-build-manifest.json',
            new compiler.webpack.sources.RawSource(JSON.stringify({ pages }, null, 2)),
          )
        },
      )
    })
  }
}


const isDev = process.env.NODE_ENV === 'development'

// security-hardening 要件11: 画像最適化の対象は、このプロジェクトの Supabase Storage だけにする。
// `*.supabase.co` のままだと、誰かが自分の Supabase プロジェクトに画像を置き、このサイトの /_next/image 経由で
// 取得・変換・配信させられる（費用の肩代わりと、無断の画像配信）。ホストは NEXT_PUBLIC_SUPABASE_URL から作る。
// 未設定・不正なビルド（環境変数なしの手元実行など）は、従来どおり `*.supabase.co`。
const supabaseMediaUrl = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return undefined
    if (url.protocol === 'https:' || (isDev && loopback && url.protocol === 'http:')) return url
  } catch { /* Unconfigured builds retain the existing HTTPS fallback. */ }
})()
const supabaseImageHost = supabaseMediaUrl?.hostname ?? '*.supabase.co'
const supabaseMediaSource = supabaseMediaUrl ? ` ${supabaseMediaUrl.origin}` : ''
const supabaseConnectionSources = supabaseMediaUrl
  ? `${supabaseMediaSource} ${supabaseMediaUrl.origin.replace(/^http/, 'ws')}` : ''
const localSupabaseImages = isDev && !!supabaseMediaUrl &&
  ['localhost', '127.0.0.1', '[::1]'].includes(supabaseMediaUrl.hostname)

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  // The public label is compiled from trusted build configuration; it contains no credentials.
  // Worker runtime bindings cannot change browser constants after the build.
  env: {
    NEXT_PUBLIC_DEPLOYMENT_ENV: process.env.ZARIDASU_DEPLOYMENT_ENV
      ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  },
  // REQ-216 FR-216-01: X-Powered-By を本番レスポンスから除去し、フレームワーク露出
  // (fingerprinting) を減らす。Next.js のデフォルトは true。
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    // OpenNext does not recheck remotePatterns after redirects; keep the Vercel default unchanged.
    ...(process.env.ZARIDASU_RUNTIME === 'cloudflare' ? { maximumRedirects: 0 } : {}),
    // Only an explicitly configured loopback backend may serve local development images.
    dangerouslyAllowLocalIP: localSupabaseImages,
    // REQ-199 FR-199-07: 投稿写真は不変パスのため、AVIF/WebP 再変換頻度を下げる(31日)。
    minimumCacheTTL: 2678400,
    remotePatterns: [
      {
        protocol: supabaseMediaUrl?.protocol === 'http:' ? 'http' : 'https',
        hostname: supabaseImageHost,
        port: supabaseMediaUrl?.port,
        pathname: '/storage/v1/object/public/**',
      },
      // REQ-147: toThumbnailUrl は public パスを render/image パスへ書き換える
      // （?width=&quality= 付き）。サムネ URL を Next.js Image Optimization の
      // 対象に含めるため render/image パスも許可する。search 未指定により任意のクエリを許可。
      {
        protocol: supabaseMediaUrl?.protocol === 'http:' ? 'http' : 'https',
        hostname: supabaseImageHost,
        port: supabaseMediaUrl?.port,
        pathname: '/storage/v1/render/image/public/**',
      },
    ],
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'react-i18next',
      'date-fns',
    ],
  },
  // REQ-250 NFR-250-01: three / react-three-fiber を単一の named async チャンク（crayfish3d）へ隔離する。
  //  (i)  3D スタックを初期/共有/フレームワークチャンクへ絶対に混ぜない（chunks:'async' 限定）。
  //  (ii) size-limit で決定的グロブ（crayfish3d-*.js）として専用バジェットを張れるようにする。
  // クライアントビルドのみ・既存 cacheGroups を壊さず 1 グループ追加するだけ（他チャンクは非影響）。
  webpack: (config, { isServer }) => {
    const splitChunks = config.optimization?.splitChunks
    if (!isServer && splitChunks && typeof splitChunks === 'object') {
      config.plugins.push(new AppBuildManifestCompatPlugin())
      splitChunks.cacheGroups = {
        ...(splitChunks.cacheGroups ?? {}),
        // REQ-325: GateとHomeが使う小さな状態モジュールは既定の最小サイズ未満でも
        // 共有する。本体OnboardingFlow/保存APIは対象外で、遅延読込のままにする。
        onboardingState: {
          test: /[\\/]src[\\/](hooks[\\/]useOnboardingStatus\.ts|lib[\\/]onboarding[\\/]index\.ts)$/,
          name: 'onboarding-state',
          chunks: 'all',
          minChunks: 2,
          priority: 30,
          enforce: true,
        },
        crayfish3d: {
          test: /[\\/]node_modules[\\/](three|@react-three)[\\/]/,
          name: 'crayfish3d',
          chunks: 'async',
          priority: 50,
          enforce: true,
        },
      }
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // REQ-081: microphone=() は self すら禁止する仕様のため、self 限定で許可。
          // REQ-216 FR-216-03: 未使用機能 (payment/usb/accelerometer 等) を明示無効化し
          // アタックサーフェスを縮小。geolocation は投稿フォームの現在地取得
          // (PostForm.tsx getCurrentPosition) で使うため self 限定で許可し機能を維持する。
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(self), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()' },
          // REQ-216 FR-216-02: Cross-Origin 分離の緩和層。
          // COOP same-origin = window.opener 経由のクロスオリジン参照を分離 (tab-nabbing /
          // Spectre 系緩和)。GTM は window.opener を必要としないため same-origin で問題ない
          // (必要なら same-origin-allow-popups にフォールバック可)。
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // CORP same-site = 自サイトリソース(OG画像等)の他オリジンからの無制限埋め込みを抑止。
          // same-origin にすると Supabase Storage 画像や OG 画像が壊れる恐れがあるため same-site。
          // COEP(require-corp) は OSM タイル/GTM/Supabase 画像/unpkg を壊すリスクが高いため
          // 本 REQ では追加しない (FR-216-04: 将来の任意項目として影響評価が必要)。
          { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js dev mode requires unsafe-eval for HMR/React DevTools
              // NOTE: 'unsafe-inline' is required in production because Next.js injects
              // inline scripts for bootstrapping (e.g. __NEXT_DATA__, chunk loading).
              // Removing it breaks page hydration. XSS risk is mitigated through:
              //   1) Server-side input sanitization on all user content
              //   2) React's built-in JSX escaping
              //   3) Proper JSON-LD escaping in structured data output
              // A nonce-based CSP is not yet supported by Next.js headers config.
              // 判断記録: docs/requirements/REQ-116-csp-unsafe-inline-decision.md
              // (REQ-006 は REQ-116 で「無期限保留」として判断記録済)
              // REQ-212 NFR-212-05: Cloudflare Turnstile（Supabase Auth 組み込み CAPTCHA）の
              // ウィジェット JS。script/frame/connect すべて challenges.cloudflare.com を最小許可する。
              `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://challenges.cloudflare.com`,
              // Leaflet dynamically injects styles; unsafe-inline required for map rendering
              "style-src 'self' 'unsafe-inline' https://unpkg.com",
              `img-src 'self' https: data: blob:${supabaseMediaSource}`,
              // REQ-080/083: <audio> 要素のソース。録音プレビュー用 blob: と Supabase Storage を許可。
              // media-src を明示しないと default-src 'self' にフォールバックして外部音声がブロックされる。
              `media-src 'self' blob: data: https://*.supabase.co${supabaseMediaSource}`,
              `connect-src 'self' https://*.supabase.co wss://*.supabase.co${supabaseConnectionSources} https://nominatim.openstreetmap.org https://api.open-meteo.com https://archive-api.open-meteo.com https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://*.analytics.google.com https://va.vercel-scripts.com https://challenges.cloudflare.com${isDev ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
              "font-src 'self'",
              // REQ-212: Turnstile はチャレンジ UI を iframe で描画するため frame-src に追加。
              "frame-src https://www.googletagmanager.com https://challenges.cloudflare.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
      {
        source: '/wasm/:path*',
        headers: [
          { key: 'Content-Type', value: 'application/wasm' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ]
  },
}

// REQ-099: withSentryConfig(withBundleAnalyzer(nextConfig)) の入れ子順で
// Sentry の SourceMap アップロードと bundle-analyzer を両立させる。
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  // SourceMap アップロード用設定。SENTRY_AUTH_TOKEN は CI / Vercel に設定する。
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  // REQ-200 FR-200-02: 非推奨の disableLogger を後継 bundleSizeOptimizations へ移行。
  // Sentry SDK の debug ログ文を本番バンドルから除去してサイズを抑える。
  bundleSizeOptimizations: { excludeDebugStatements: true },
  tunnelRoute: undefined,
})
