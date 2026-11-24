import Image from 'next/image'
import Link from 'next/link'
import type { LatLngTuple } from 'leaflet'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { getInfoType, getSpecies } from '@/lib/constants'
import { getDateLocale } from '@/lib/dateLocales'
import RouteLinks from '@/components/ui/RouteLinks'
import type { MapPost, SurveyRequest } from './MapView'

export function PostPopupContent({ post }: { post: MapPost & { lat: number; lng: number } }) {
  const { t, i18n } = useTranslation()
  const species = getSpecies(post.species)
  return (
    <div className="text-sm" style={{ minWidth: '180px' }}>
      <div className="font-bold mb-1 flex items-center gap-1.5">
        {species && (
          <Image
            src={species.image}
            alt={t(`species.${post.species}`)}
            width={20}
            height={20}
            className="inline-block w-5 h-5 object-contain shrink-0"
          />
        )}
        {t(`species.${post.species}`)}
      </div>
      <div className="text-gray-600 text-sm mb-1">
        {getInfoType(post.info_type)?.emoji || ''} {t(`infoType.${post.info_type}`)} ·{' '}
        {format(new Date(post.created_at), 'M/d', { locale: getDateLocale(i18n.language) })}
      </div>
      {post.municipality && <div className="text-gray-600 text-sm mb-1">{post.municipality}</div>}
      {(post.locality || post.water_body) && (
        <div className="text-gray-500 text-xs mb-2">
          {post.locality}
          {post.locality && post.water_body && ' · '}
          {post.water_body && <span>💧 {post.water_body}</span>}
        </div>
      )}
      {post.comment && (
        <div className="text-gray-700 text-sm mb-2 max-w-xs wrap-break-word line-clamp-3">{post.comment}</div>
      )}
      {/* 公開用に粗化された座標だけを経路リンクへ渡す（REQ-243/329）。 */}
      <RouteLinks lat={post.lat} lng={post.lng} approximate variant="popup" className="mb-2" />
      <Link href={`/post/${post.id}`} className="text-brand-700 hover:text-brand-800 text-sm font-medium">
        {t('postCard.detail')} →
      </Link>
    </div>
  )
}

export function SurveyPopupContent({ request, position }: { request: SurveyRequest; position: LatLngTuple }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="text-sm" style={{ minWidth: '180px' }}>
      <div className="font-bold mb-1 flex items-center gap-1.5">🔍 {t('survey.markerTitle')}</div>
      <div className="text-gray-600 text-sm mb-1">
        {request.municipality || ''} · {format(new Date(request.created_at), 'M/d', { locale: getDateLocale(i18n.language) })}
      </div>
      {request.reason && <div className="text-gray-700 text-sm mb-2 line-clamp-2">{request.reason}</div>}
      <RouteLinks lat={position[0]} lng={position[1]} approximate variant="popup" className="mb-2" />
      <Link href={`/request/${request.id}`} className="text-amber-700 hover:text-amber-800 text-sm font-medium">
        {t('survey.viewDetail')} →
      </Link>
    </div>
  )
}
