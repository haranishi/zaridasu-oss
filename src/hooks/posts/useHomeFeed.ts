import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { selectPublicPostsForHome } from '@/lib/data/posts'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

export interface HomePost {
  id: string
  species: string
  info_type: string
  municipality: string | null
  photos: string[] | null
  comment: string | null
  created_at: string
  likes: { id: string }[]
  comments: { id: string; content: string; created_at: string }[]
}

export function useHomeFeed(ids?: string[]) {
  const idsKey = ids?.slice(0, 200).join(',')
  const [posts, setPosts] = useState<HomePost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const online = useOnlineStatus()
  const request = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(false)
    try {
      if (!navigator.onLine) throw new Error('offline')
      const selectedIds = idsKey === undefined ? undefined : idsKey ? idsKey.split(',') : []
      if (selectedIds && !selectedIds.length) { setPosts([]); return }
      let query = selectPublicPostsForHome(supabase)
      if (selectedIds) query = query.in('id', selectedIds)
      const { data, error: queryError } = await query
        .order('created_at', { ascending: false }).limit(selectedIds ? 200 : 24).abortSignal(controller.signal)
      if (controller.signal.aborted) return
      if (queryError) throw queryError
      setPosts(data ?? [])
    } catch {
      if (!controller.signal.aborted) setError(true)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [idsKey])
  useEffect(() => {
    void refresh()
    return () => request.current?.abort()
  }, [refresh, online])
  return { posts, loading, error, refresh }
}
