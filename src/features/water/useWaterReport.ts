'use client'

import { useEffect, useRef, useState } from 'react'

import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'

import { WATER_REPORT_LIMITS } from './constants'
import { prepareWaterPhoto, uploadWaterPhoto, WaterPhotoError } from './data/photos'
import { insertWaterReport, type NewWaterReport } from './data/reports'
import type { WaterPosition } from './types'

interface Photo { file: File; preview: string; path?: string }

/** A sheet-local draft. Nothing private is placed in localStorage or the public photo bucket. */
export function useWaterReport(userId: string, position: WaterPosition) {
  const { user } = useAuth()
  const account = useRef(user?.id)
  account.current = user?.id
  const mounted = useRef(true)
  const processing = useRef(false)
  const sending = useRef(false)
  const photosRef = useRef<Photo[]>([])
  const clientId = useRef<string | null>(null)
  const snapshot = useRef<NewWaterReport | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photoProcessing, setPhotoProcessing] = useState<{ current: number; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [errorKey, setErrorKey] = useState('')
  const current = () => mounted.current && account.current === userId

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview))
    }
  }, [])

  async function addPhotos(files: FileList | readonly File[] | null) {
    if (!current() || processing.current || sending.current || snapshot.current || !files) return
    const originals = Array.from(files).slice(0, WATER_REPORT_LIMITS.photosMax - photosRef.current.length)
    if (originals.length === 0) return
    processing.current = true
    setErrorKey('')
    setPhotoProcessing({ current: 0, total: originals.length })
    try {
      for (const [index, original] of originals.entries()) {
        if (!current()) return
        try {
          const file = await prepareWaterPhoto(original)
          if (!current()) return
          const photo = { file, preview: URL.createObjectURL(file) }
          photosRef.current = [...photosRef.current, photo]
          setPhotos(photosRef.current)
        } catch (error) {
          if (!current()) return
          setErrorKey(`water.report.errors.${error instanceof WaterPhotoError ? error.kind : 'conversion'}`)
        }
        if (current()) setPhotoProcessing({ current: index + 1, total: originals.length })
      }
    } finally {
      processing.current = false
      if (current()) setPhotoProcessing(null)
    }
  }

  function removePhoto(index: number) {
    if (!current() || processing.current || sending.current || snapshot.current) return
    const removed = photosRef.current[index]
    if (!removed) return
    URL.revokeObjectURL(removed.preview)
    photosRef.current = photosRef.current.filter((_, i) => i !== index)
    setPhotos(photosRef.current)
  }

  async function submit(name: string, note: string): Promise<boolean> {
    if (!current()) { setErrorKey('water.report.errors.accountChanged'); return false }
    if (sending.current || processing.current) return false
    if (!snapshot.current) {
      if (!name.trim() || name.trim().length > WATER_REPORT_LIMITS.nameMax) {
        setErrorKey('water.report.errors.name'); return false
      }
      if (note.trim().length > WATER_REPORT_LIMITS.noteMax) {
        setErrorKey('water.report.errors.note'); return false
      }
      if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng) || Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) {
        setErrorKey('water.report.errors.position'); return false
      }
      if (photosRef.current.length < 1 || photosRef.current.length > WATER_REPORT_LIMITS.photosMax) {
        setErrorKey('water.report.errors.photos'); return false
      }
      clientId.current ??= crypto.randomUUID()
      snapshot.current = {
        userId, clientId: clientId.current, name: name.trim(), note: note.trim() || null,
        lat: position.lat, lng: position.lng, photoPaths: [],
      }
      setLocked(true)
    }
    sending.current = true
    setBusy(true)
    setErrorKey('')
    try {
      for (const photo of photosRef.current) {
        if (!current()) return false
        photo.path ??= await uploadWaterPhoto(supabase, userId, photo.file)
        if (!current()) return false
      }
      snapshot.current.photoPaths = photosRef.current.map((photo) => photo.path!)
      if (!current()) return false
      await insertWaterReport(supabase, snapshot.current)
      // A late response from the previous account must never close another person's sheet.
      return current()
    } catch {
      // INSERT may already have committed. Preserve UUID, the exact input and uploaded objects.
      if (current()) setErrorKey('water.report.errors.save')
      return false
    } finally {
      sending.current = false
      if (current()) setBusy(false)
    }
  }

  return { photos, photoProcessing, busy, locked, errorKey, addPhotos, removePhoto, submit }
}
