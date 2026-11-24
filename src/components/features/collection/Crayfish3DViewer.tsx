'use client'

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Canvas, useFrame, type ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { useTranslation } from 'react-i18next'
import { RotateCcw, RotateCw, Pause, Play } from 'lucide-react'

/**
 * REQ-250 FR-250-04 フェーズ2: 実 3D のザリガニ・ビューア（react-three-fiber + three）。
 *
 * ★このファイルは「3Dで見る」クリック時にのみ読み込まれる遅延チャンク★
 * Crayfish3DStage の `dynamic(() => import('./Crayfish3DViewer'), { ssr:false })` からのみ参照され、
 * /collection の初期ロードにも他ルートにも three は載らない（厳格分離 / NFR-250-01）。
 *
 * モデルは外部 .glb を使わない「手続き生成の低ポリ・ザリガニ」（自己完結・オフライン安全 / NFR-250-03）。
 * 色は SpeciesOption.color を基調に陰影を派生させる。回転はドラッグ＋ラベル付きボタン（キーボード操作可）。
 * 自動回転は reduced-motion では無効（NFR-250-02: 自動スピンしない）。
 */

interface Crayfish3DViewerProps {
  /** モデルの基調色（SpeciesOption.color）。 */
  color: string
  /** reduced-motion 時 true。自動回転を無効化する。 */
  reducedMotion: boolean
  /** canvas の代替テキスト（種の説明＋操作方法）。 */
  label: string
}

interface Shades {
  body: string
  dark: string
  light: string
  claw: string
}

/** 基調色から胴/陰/ハイライト/ハサミの色を派生（低ポリでも立体感が出るよう明度差をつける）。 */
function makeShades(color: string): Shades {
  const base = new THREE.Color(color)
  return {
    body: `#${base.getHexString()}`,
    dark: `#${base.clone().multiplyScalar(0.6).getHexString()}`,
    light: `#${base.clone().lerp(new THREE.Color('#ffffff'), 0.3).getHexString()}`,
    claw: `#${base.clone().lerp(new THREE.Color('#ffffff'), 0.12).getHexString()}`,
  }
}

/** 単色マット付きメッシュの薄いラッパ（各パーツの記述を短くする）。 */
function Seg({ c, children, ...rest }: ThreeElements['mesh'] & { c: string }) {
  return (
    <mesh {...rest}>
      {children}
      <meshStandardMaterial color={c} roughness={0.5} metalness={0.06} />
    </mesh>
  )
}

/** 左右対称パーツ（ハサミ・脚・触角・眼）を +X 側に一度だけ定義（<group scale={[-1,1,1]}> で反転複製する）。 */
function CrayfishSide({ shades }: { shades: Shades }) {
  const legZ = [0.55, 0.18, -0.2]
  return (
    <group>
      {/* 肩関節 */}
      <Seg c={shades.dark} position={[0.5, -0.05, 0.95]}>
        <sphereGeometry args={[0.16, 12, 12]} />
      </Seg>
      {/* 鋏脚アーム */}
      <Seg c={shades.body} position={[0.74, -0.06, 1.35]} rotation={[1.2, 0.5, 0]}>
        <capsuleGeometry args={[0.13, 0.5, 6, 12]} />
      </Seg>
      {/* ハサミの掌部（マヌス） */}
      <Seg c={shades.claw} position={[1.0, -0.07, 1.85]} rotation={[0, 0.2, 0]}>
        <boxGeometry args={[0.28, 0.22, 0.42]} />
      </Seg>
      {/* 不動指 */}
      <Seg c={shades.claw} position={[1.06, 0.02, 2.2]} rotation={[Math.PI / 2 + 0.12, 0.18, 0]}>
        <coneGeometry args={[0.07, 0.5, 10]} />
      </Seg>
      {/* 可動指（わずかに開いてハサミらしく） */}
      <Seg c={shades.body} position={[1.02, -0.18, 2.16]} rotation={[Math.PI / 2 - 0.06, 0.22, 0]}>
        <coneGeometry args={[0.06, 0.46, 10]} />
      </Seg>
      {/* 触角（長く前方へ） */}
      <Seg c={shades.dark} position={[0.62, 0.28, 2.15]} rotation={[1.15, -0.5, 0]}>
        <capsuleGeometry args={[0.03, 1.7, 4, 8]} />
      </Seg>
      {/* 眼柄＋複眼 */}
      <Seg c={shades.body} position={[0.24, 0.32, 1.42]} rotation={[0.5, 0, 0.2]}>
        <capsuleGeometry args={[0.05, 0.16, 4, 8]} />
      </Seg>
      <Seg c="#0b1220" position={[0.28, 0.46, 1.5]}>
        <sphereGeometry args={[0.11, 12, 12]} />
      </Seg>
      {/* 歩脚（3対） */}
      {legZ.map((z, i) => (
        <Seg key={i} c={shades.dark} position={[0.62, -0.34, z]} rotation={[0.15, 0, -0.95]}>
          <capsuleGeometry args={[0.04, 0.7, 4, 8]} />
        </Seg>
      ))}
    </group>
  )
}

/**
 * 手続き生成の低ポリ・ザリガニ本体（頭部を +Z=手前に向けて組む）。
 *
 * ── SEAM: 将来アーティスト製 .glb に差し替える箇所 ─────────────────────────────
 * 呼び出し側（CrayfishRig）を変えずに、この <ProceduralCrayfish/> だけを GLTF 版へ置換できる:
 *   import { useLoader } from '@react-three/fiber'
 *   import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
 *   const { scene } = useLoader(GLTFLoader, '/models/crayfish.glb')
 *   scene.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) (m as THREE.MeshStandardMaterial).color.set(shades.body) })
 *   return <primitive object={scene} />
 * その際 .glb は Storage/CDN 配信とし JS バンドルへ含めない（FR-250-04(vi) / NFR-250-03）。
 * 現状は外部アセット不要で完全自己完結（追加のネットワーク取得・キャッシュ戦略が要らない）。
 * ───────────────────────────────────────────────────────────────────────────
 */
function ProceduralCrayfish({ shades }: { shades: Shades }) {
  // 腹部（尾に向かって細くなる 5 節・わずかに下へカール）。
  const abdomen = [
    { z: -0.5, r: 0.5, y: -0.02 },
    { z: -0.88, r: 0.44, y: -0.08 },
    { z: -1.22, r: 0.37, y: -0.16 },
    { z: -1.52, r: 0.3, y: -0.26 },
    { z: -1.78, r: 0.24, y: -0.36 },
  ]
  // 尾扇（テルソン＋尾肢。X 方向に扇状に広げる）。
  const fan = [-0.5, -0.25, 0, 0.25, 0.5]

  return (
    <group>
      {/* 頭胸部（甲羅）: Z 軸に沿ったカプセル */}
      <Seg c={shades.body} position={[0, 0, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.58, 1.2, 8, 20]} />
      </Seg>
      {/* 背の稜線ハイライト */}
      <Seg c={shades.light} position={[0, 0.38, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.22, 1.0, 6, 12]} />
      </Seg>
      {/* 額角（ロストルム） */}
      <Seg c={shades.dark} position={[0, 0.04, 1.52]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.26, 0.7, 14]} />
      </Seg>

      {/* 腹節 */}
      {abdomen.map((s, i) => (
        <Seg key={i} c={i % 2 ? shades.dark : shades.body} position={[0, s.y, s.z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[s.r, s.r * 0.9, 0.34, 16]} />
        </Seg>
      ))}

      {/* 尾扇 */}
      {fan.map((a, i) => (
        <Seg
          key={i}
          c={i === 2 ? shades.dark : shades.body}
          position={[Math.sin(a) * 0.34, -0.42, -2.02]}
          rotation={[-0.32, a, 0]}
        >
          <boxGeometry args={[0.16, 0.05, 0.55]} />
        </Seg>
      ))}

      {/* 左右対称パーツ（+X 側 → 反転複製で -X 側） */}
      <CrayfishSide shades={shades} />
      <group scale={[-1, 1, 1]}>
        <CrayfishSide shades={shades} />
      </group>
    </group>
  )
}

/** 回転リグ: 自動回転（reduced-motion では無効）＋ドラッグ/ボタンの角度を毎フレーム適用。 */
function CrayfishRig({
  shades,
  rotationRef,
  autoplay,
  reducedMotion,
}: {
  shades: Shades
  rotationRef: React.MutableRefObject<{ x: number; y: number }>
  autoplay: boolean
  reducedMotion: boolean
}) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    const g = ref.current
    if (!g) return
    // NFR-250-02: 自動スピンは reduced-motion では回さない。手動ドラッグ/ボタンは常に反映。
    if (autoplay && !reducedMotion) rotationRef.current.y += delta * 0.5
    g.rotation.y = rotationRef.current.y
    g.rotation.x = rotationRef.current.x
  })
  return (
    <group ref={ref} rotation={[rotationRef.current.x, rotationRef.current.y, 0]}>
      <group position={[0, 0.1, 0.2]} scale={0.9}>
        <ProceduralCrayfish shades={shades} />
      </group>
    </group>
  )
}

export default function Crayfish3DViewer({ color, reducedMotion, label }: Crayfish3DViewerProps) {
  const { t } = useTranslation()
  const shades = useMemo(() => makeShades(color), [color])
  // 回転角は ref（毎フレーム読む・ドラッグ中に React 再描画しない＝スムーズ）。
  const rotationRef = useRef({ x: 0.14, y: 0.55 })
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  // REQ-268 FR-268-13: frameloop を autoplay 中のみ 'always'、停止中は 'demand' にしてモバイルの
  // 電池/GPU を節約する。demand 中はドラッグ/nudge で invalidate() を呼んで 1 フレーム描画する。
  const invalidateRef = useRef<(() => void) | null>(null)
  // 自動回転の既定は reduced-motion なら off（＝開いても自動スピンしない）。
  const [autoplay, setAutoplay] = useState(!reducedMotion)

  const onDown = (e: ReactPointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    dragRef.current = { x: e.clientX, y: e.clientY }
    rotationRef.current.y += dx * 0.01
    rotationRef.current.x = THREE.MathUtils.clamp(rotationRef.current.x + dy * 0.008, -0.7, 0.7)
    invalidateRef.current?.()
  }
  const onUp = () => {
    dragRef.current = null
  }
  const nudge = (dir: number) => {
    rotationRef.current.y += dir * 0.4
    invalidateRef.current?.()
  }

  const btn =
    'inline-flex items-center justify-center w-11 h-11 rounded-lg bg-white/85 dark:bg-slate-900/85 ' +
    'text-gray-700 dark:text-slate-200 shadow-xs hover:bg-white dark:hover:bg-slate-800 ' +
    'focus:outline-hidden focus:ring-2 focus:ring-(--color-brand-500) focus:ring-offset-1 dark:focus:ring-offset-slate-900 transition-colors'

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* 3D 描画面。role=img + aria-label で代替テキストを提供（FR-250-04(v)）。ドラッグで回転。 */}
      <div
        role="img"
        aria-label={label}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        className="relative flex-1 touch-none cursor-grab active:cursor-grabbing"
      >
        <Canvas
          camera={{ position: [0, 1.0, 4.7], fov: 42 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
          frameloop={autoplay && !reducedMotion ? 'always' : 'demand'}
          onCreated={({ invalidate }) => { invalidateRef.current = invalidate }}
        >
          <ambientLight intensity={0.75} />
          <directionalLight position={[3, 5, 4]} intensity={1.1} />
          <directionalLight position={[-4, 2, -3]} intensity={0.4} />
          <CrayfishRig shades={shades} rotationRef={rotationRef} autoplay={autoplay} reducedMotion={reducedMotion} />
        </Canvas>
      </div>

      {/* 操作パネル（キーボード操作可能な <button>＝a11y の操作コントロール / FR-250-04(v)）。 */}
      <div role="group" aria-label={t('collection.viewer3d.controls')} className="flex items-center justify-center gap-2 py-2">
        <button type="button" onClick={() => nudge(-1)} aria-label={t('collection.viewer3d.rotateLeft')} className={btn}>
          <RotateCcw size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setAutoplay((v) => !v)}
          aria-pressed={autoplay}
          aria-label={autoplay ? t('collection.viewer3d.pause') : t('collection.viewer3d.play')}
          className={btn}
        >
          {autoplay ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </button>
        <button type="button" onClick={() => nudge(1)} aria-label={t('collection.viewer3d.rotateRight')} className={btn}>
          <RotateCw size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
