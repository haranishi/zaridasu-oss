'use client'

import AdminLayout from '@/views/admin/AdminLayout'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { useAdminSessionTimeout } from '@/hooks/admin/useAdminSessionTimeout'

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  // REQ-018C: Auto sign-out after 30 min inactivity, warning at 25 min
  useAdminSessionTimeout()
  return <AdminLayout>{children}</AdminLayout>
}

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ErrorBoundary>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </ErrorBoundary>
  )
}
