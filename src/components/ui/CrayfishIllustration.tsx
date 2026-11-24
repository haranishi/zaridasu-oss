import React from 'react'

/**
 * ザリガニ SVG イラストコンポーネント
 * 側面図（左向き）: 触角→頭部→ハサミ→胴体→腹部→尾扇
 */

interface CrayfishIllustrationProps {
  className?: string
  style?: React.CSSProperties
  /**
   * REQ-250: 可動指（ハサミの動く側）に付与するクラス名。水槽で `aquarium-claw` を渡すと
   * ゆっくり開閉する（既定は未指定＝静止。既存の空状態/About/404 の描画は一切変わらない）。
   */
  clawClassName?: string
}

export default function CrayfishIllustration({ className = '', style = {}, clawClassName = '' }: CrayfishIllustrationProps) {
  return (
    <svg
      viewBox="0 0 280 160"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* 尾扇（5枚） */}
      {/* 外側上 */}
      <path d="M228,63 C240,48 262,42 266,57 C270,65 254,69 234,69 Z" fill="#EF4444"/>
      {/* 上ウロポッド */}
      <path d="M228,67 C241,56 263,50 267,63 C271,71 255,75 237,74 Z" fill="#DC2626"/>
      {/* 中央テルソン */}
      <path d="M228,71 C243,64 265,66 269,77 C273,87 257,94 238,90 Z" fill="#B91C1C"/>
      {/* 下ウロポッド */}
      <path d="M228,91 C241,100 261,106 265,95 C269,87 253,83 235,83 Z" fill="#DC2626"/>
      {/* 外側下 */}
      <path d="M228,95 C238,107 258,114 262,102 C266,94 250,88 232,88 Z" fill="#EF4444"/>

      {/* 腹部（4節） */}
      {/* 第4節（テルソン側） */}
      <path d="M216,65 Q227,65 228,80 Q227,95 216,95 Q213,80 216,65Z" fill="#DC2626"/>
      {/* 第3節 */}
      <rect x="198" y="63" width="20" height="34" rx="3" fill="#EF4444"/>
      {/* 第2節 */}
      <rect x="179" y="61" width="21" height="38" rx="3" fill="#DC2626"/>
      {/* 第1節（胸甲側） */}
      <path d="M166,57 Q180,55 181,80 Q180,105 166,103 Q162,80 166,57Z" fill="#EF4444"/>

      {/* 遊泳肢（腹部下の小足） */}
      <path d="M183,99 L180,114" stroke="#B91C1C" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M198,101 L196,116" stroke="#B91C1C" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M214,99 L213,114" stroke="#B91C1C" strokeWidth="1.5" fill="none" strokeLinecap="round"/>

      {/* 歩脚（5対、胸甲下部） */}
      <path d="M83,106 C79,119 75,131 71,143" stroke="#991B1B" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M99,112 C95,125 92,137 89,149" stroke="#991B1B" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M116,115 C114,127 113,139 113,151" stroke="#991B1B" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <path d="M133,115 C134,127 135,139 136,151" stroke="#991B1B" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <path d="M150,112 C152,125 154,137 156,149" stroke="#991B1B" strokeWidth="2" fill="none" strokeLinecap="round"/>

      {/* 胸甲（メインボディ） */}
      <ellipse cx="117" cy="80" rx="56" ry="34" fill="#DC2626"/>
      {/* 光沢ハイライト */}
      <ellipse cx="104" cy="67" rx="33" ry="17" fill="#FCA5A5" opacity="0.25"/>
      {/* 頸溝ライン */}
      <path d="M81,51 Q117,45 155,55" stroke="#991B1B" strokeWidth="1.5" fill="none"/>

      {/* 頭部 */}
      <ellipse cx="63" cy="80" rx="19" ry="25" fill="#B91C1C"/>

      {/* 額角（ロストルム） */}
      <polygon points="44,76 44,84 33,80" fill="#991B1B"/>

      {/* 第1・第2触角 */}
      <path d="M51,67 C34,55 15,44 0,38" stroke="#7F1D1D" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M51,70 C32,64 12,63 0,68" stroke="#7F1D1D" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* 短い第2小触角 */}
      <path d="M49,74 C37,70 26,70 18,74" stroke="#991B1B" strokeWidth="1" fill="none" strokeLinecap="round"/>
      <path d="M49,78 C37,80 27,82 20,80" stroke="#991B1B" strokeWidth="1" fill="none" strokeLinecap="round"/>

      {/* 眼（複眼） */}
      <circle cx="54" cy="63" r="8.5" fill="#1F2937"/>
      <circle cx="56" cy="61" r="3" fill="white"/>
      <circle cx="57" cy="62" r="1.2" fill="white" opacity="0.6"/>

      {/* 鋏脚（ハサミ） */}
      {/* アーム */}
      <path d="M74,67 C65,55 55,47 44,43"
        stroke="#DC2626" strokeWidth="9" fill="none" strokeLinecap="round"/>
      {/* 関節 */}
      <circle cx="45" cy="43" r="7.5" fill="#B91C1C"/>
      {/* 不動指 */}
      <path d="M45,43 C35,33 21,31 17,42"
        stroke="#991B1B" strokeWidth="6" fill="none" strokeLinecap="round"/>
      {/* ハサミ先端（不動指側） */}
      <circle cx="18" cy="42" r="4" fill="#7F1D1D"/>
      {/* 可動指（動く側）＋その先端。水槽ではこのグループがゆっくり開閉する（clawClassName）。 */}
      <g className={clawClassName}>
        <path d="M45,43 C35,53 23,58 19,66"
          stroke="#EF4444" strokeWidth="5" fill="none" strokeLinecap="round"/>
        <circle cx="20" cy="66" r="3.5" fill="#DC2626"/>
      </g>
    </svg>
  )
}
