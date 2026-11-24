'use client'

import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { getSpecies, getInfoType } from '@/lib/constants'

interface RecentPost {
  id: string
  species: string
  info_type: string
  municipality?: string
  created_at: string
  is_anonymous: boolean
}

interface RecentPostsCardProps {
  posts: RecentPost[]
}

export default function RecentPostsCard({ posts }: RecentPostsCardProps) {
  const { t } = useTranslation()
  if (!posts) return null
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t('admin.components.recentPosts.title')}</h2>
        <Link href="/admin/posts" className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
          {t('admin.components.recentPosts.viewAll')}
        </Link>
      </div>
      <div className="flex-1 divide-y divide-gray-50">
        {posts.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">{t('admin.components.recentPosts.empty')}</p>
        )}
        {posts.map(post => {
          const sp = getSpecies(post.species)
          const it = getInfoType(post.info_type)
          return (
            <div key={post.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                style={{ backgroundColor: (sp?.color ?? '#6b7280') + '18' }}
              >
                <span style={{ color: sp?.color ?? '#6b7280' }}>🦞</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">
                  {sp?.label ?? t('admin.components.recentPosts.unknown')} · {it?.label ?? t('admin.components.recentPosts.unknown')}
                </p>
                <p className="text-xs text-gray-400 truncate">{post.municipality || t('admin.components.recentPosts.municipalityUnknown')}</p>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <p className="text-xs text-gray-400">
                  {new Date(post.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                </p>
                {post.is_anonymous
                  ? <span className="text-xs text-gray-400">{t('admin.components.recentPosts.anonymous')}</span>
                  : <span className="text-xs text-blue-600 font-medium">{t('admin.components.recentPosts.verified')}</span>
                }
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
