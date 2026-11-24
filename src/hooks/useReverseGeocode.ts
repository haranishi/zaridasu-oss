import { useState, useEffect, useRef } from 'react'
import { TARGET_PREFECTURE } from '@/lib/constants'
import { getCachedGeocode } from '@/lib/geocodeCache'
import { fetchMunicipality } from '@/lib/reverseGeocodeMunicipality'
import type { LatLng, UseReverseGeocodeResult, GeocodeError } from '@/types'

const DEBOUNCE_MS = 500

/**
 * 座標から秋田県の市区町村名を逆ジオコーディングで取得する
 * キャッシュヒット時はAPIを叩かずに即座に返す（約100m粒度のLRUキャッシュ）
 */
export function useReverseGeocode(position: LatLng | null): UseReverseGeocodeResult {
  const [municipality, setMunicipality] = useState('')
  // REQ-255: 解決した都道府県名（対象エリア判定用）。未解決/失敗時は ''。
  const [prefecture, setPrefecture] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState<GeocodeError>('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevPos = useRef<LatLng | null>(null)
  const currentPos = useRef<LatLng | null>(null)
  // REQ-274 FR-274-02: 要求シーケンス。ピン連続移動時に「古い座標の応答が後から解決して
  // 新しい結果を上書きする」(last-resolved-wins) のを防ぐ。開始済み fetch は中断しないが、
  // 解決時に最新要求か照合してから setState する。アンマウント時は +1 して全応答を破棄。
  const seqRef = useRef(0)
  useEffect(() => () => { seqRef.current++ }, [])

  const fetchGeocode = async (pos: LatLng) => {
    if (!pos) return
    const seq = ++seqRef.current

    // キャッシュチェック（APIコール前）
    const cached = getCachedGeocode(pos.lat, pos.lng)
    if (cached !== null) {
      setMunicipality(cached)
      // REQ-255: 一致した市区町村は必ず秋田県内（MUNICIPALITIES は秋田県のみ）。
      // 未一致キャッシュ（'')は県不明のまま扱う（対象外の断定はしない）。
      setPrefecture(cached ? TARGET_PREFECTURE : '')
      setGeocodeError(cached ? '' : 'market')
      return
    }

    setGeocoding(true)
    setGeocodeError('')
    try {
      // 問い合わせ・一致判定・キャッシュへの書き込みは不在の投稿（REQ-330）と共通の関数で行う。
      // キャッシュは座標キーで常に正しいため、stale 応答でも書いてよい（重複APIコール防止）。
      const { municipality: result, prefecture: resolvedPrefecture } = await fetchMunicipality(pos.lat, pos.lng, 5000)
      const matched = result !== ''
      // REQ-274: 最新要求でなければ state を書かない（stale 上書き防止）。
      if (seq !== seqRef.current) return
      setMunicipality(result)
      // REQ-255: 秋田県の市区町村に一致すれば県は確定で秋田県。未一致なら Nominatim の
      // 県名（province / state）をそのまま保持し、対象外エリアのソフト注意喚起に使う。
      setPrefecture(matched ? TARGET_PREFECTURE : resolvedPrefecture)
      if (!matched) setGeocodeError('market')
    } catch (err) {
      if (seq !== seqRef.current) return
      setMunicipality('')
      setPrefecture('')
      // REQ-246: `as Error` を廃し instanceof でガードする（Error 以外の throw で message 参照が壊れない）。
      if (err instanceof Error && err.message === 'offline') {
        setGeocodeError('offline')
      } else {
        setGeocodeError('timeout')
      }
    } finally {
      if (seq === seqRef.current) setGeocoding(false)
    }
  }

  useEffect(() => {
    if (!position) return

    // 位置が変わっていなければスキップ
    if (
      prevPos.current &&
      prevPos.current.lat === position.lat &&
      prevPos.current.lng === position.lng
    )
      return
    prevPos.current = position
    currentPos.current = position

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fetchGeocode(position), DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [position])

  const retry = () => {
    if (currentPos.current) fetchGeocode(currentPos.current)
  }

  return { municipality, prefecture, geocoding, geocodeError, retry }
}
