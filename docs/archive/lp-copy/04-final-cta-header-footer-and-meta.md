## ⑦ 最終CTA（LpFinalCta）

### 見出し `lp.final.title`
> あなたの「見つけた」を、待っています。

### 本文 `lp.final.subtitle`
> 登録は無料。メールアドレスか Googleアカウントがあれば、すぐはじめられます。

### CTA
| 用途 | キー | 文言 |
|---|---|---|
| 主CTA | `lp.final.ctaPrimary` | 無料で参加する |
| 副CTA | `lp.final.ctaSecondary` | 登録せずに地図を見る |

---

## ⑧ LP専用ヘッダー / フッター / 追従バー

### ヘッダー（LpHeader）
| キー | 文言 |
|---|---|
| `lp.header.login` | ログイン |
| `lp.header.cta` | 無料で参加する |

ロゴ: 既存「ザリダス」ロゴ。クリックでページ先頭へスクロール（TBD-7: `/` 遷移にしない）。

### モバイル追従CTAバー（LpStickyCta）
| キー | 文言 |
|---|---|
| `lp.sticky.cta` | 無料で参加する |
| `lp.sticky.note` | 登録30秒・ずっと無料 |

### フッター（LpFooter）
| キー | 文言 |
|---|---|
| `lp.footer.about` | このサービスについて |
| `lp.footer.terms` | 利用規約 |
| `lp.footer.privacy` | プライバシーポリシー |
| `lp.footer.copyright` | © ザリダス |

---

## ⑨ メタ情報（SEO）

### title `（metadata）`
> ザリダスとは - 見つけて、のせて、秋田の自然を守る無料マップ

### meta description
> ザリガニやウシガエルを見つけたら、スマホで撮ってのせるだけ。AIが名前を当ててくれるから、生きものにくわしくなくても大丈夫。あなたの報告が秋田の自然を守ります。登録はずっと無料。

※ ルート `/` の description（「秋田県外来生物出没・分布情報マップ。〜リアルタイムで共有できます。」）とは別文言（NFR-176-16）。

### OGP
- og:title / og:description は上記と同一
- og:image: LP専用画像（後日生成。それまで既存 `/og-image.png` を流用）

---

