import HomeHub from '@/components/features/home/HomeHub'

/**
 * HomeShell — Server Component（RSC）の Shell。
 *
 * Phase 1（REQ-101）: Provider やインタラクティブな描画は HomePage（Client）に集約し、
 * このシェルは RSC 境界の確立のみを担う。今後の段階的リファクタで静的セクション
 * （SEO 補強・hero 等）をここへ移動していく。
 */
export default function HomeShell() {
  return <HomeHub />
}
