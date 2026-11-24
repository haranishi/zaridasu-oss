'use client'

interface LoadingScreenProps {
  fadeOut?: boolean
}

export default function LoadingScreen({ fadeOut }: LoadingScreenProps) {
  return (
    <div className={`loading-screen ${fadeOut ? 'loading-screen--fade-out' : ''}`}>
      {/* 水面の波紋 */}
      <div className="loading-ripples">
        <span className="loading-ripple" />
        <span className="loading-ripple" />
        <span className="loading-ripple" />
      </div>

      {/* 泡 */}
      {[...Array(8)].map((_, i) => (
        <span key={i} className={`loading-bubble loading-bubble--${i + 1}`} />
      ))}

      {/* メインコンテンツ */}
      <div className="loading-content">
        {/* ザリガニアイコン */}
        <div className="loading-icon">
          <span className="loading-crayfish">{'\u{1F99E}'}</span>
        </div>

        {/* タイトル */}
        <h1 className="loading-title">ザリダス</h1>
        <p className="loading-subtitle">秋田県ザリガニ情報マップ</p>

        {/* プログレスバー */}
        <div className="loading-bar-wrap">
          <div className="loading-bar" />
        </div>

        {/* ドット */}
        <div className="loading-dots">
          <span />
          <span />
          <span />
        </div>
      </div>

      {/* 底の波 */}
      <div className="loading-wave">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path
            d="M0,60 C200,100 400,20 600,60 C800,100 1000,20 1200,60 L1200,120 L0,120 Z"
            fill="rgba(255,255,255,0.08)"
          />
        </svg>
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ animationDelay: '-2s' }}>
          <path
            d="M0,40 C150,80 350,10 600,50 C850,90 1050,10 1200,50 L1200,120 L0,120 Z"
            fill="rgba(255,255,255,0.05)"
          />
        </svg>
      </div>
    </div>
  )
}
