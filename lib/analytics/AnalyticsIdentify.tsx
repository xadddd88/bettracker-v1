'use client'

import { useEffect } from 'react'
import { identifyAnalyticsUser } from './client'

export function AnalyticsIdentify({ userId }: { userId: string }) {
  useEffect(() => {
    identifyAnalyticsUser(userId)
  }, [userId])
  return null
}
