import { supabase } from './supabase/client'

const BUCKET = 'post-audio'

function extForMime(mime: string): string {
  if (mime.startsWith('audio/webm')) return 'webm'
  if (mime === 'audio/mp4') return 'm4a'
  if (mime === 'audio/mpeg') return 'mp3'
  if (mime === 'audio/ogg') return 'ogg'
  return 'webm'
}

export interface UploadedAudio {
  path: string
  publicUrl: string
}

export async function uploadAudio(blob: Blob, userId: string, mime: string): Promise<UploadedAudio> {
  const ext = extForMime(mime)
  const fileName = `${userId}/${crypto.randomUUID()}.${ext}`

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, blob, { cacheControl: '3600', upsert: false, contentType: mime })

  if (error || !data) throw error ?? new Error('upload failed')

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return { path: data.path, publicUrl }
}

export async function deleteAudio(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined)
}
