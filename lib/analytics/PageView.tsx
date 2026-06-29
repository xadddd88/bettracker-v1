'use client'

import { useEffect } from 'react'
import { trackClientEvent } from './client'

interface Props {
  event: string
  props?: Record<string, unknown>
}

export function PageView({ event, props = {} }: Props) {
  useEffect(() => {
    trackClientEvent(event, props)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
