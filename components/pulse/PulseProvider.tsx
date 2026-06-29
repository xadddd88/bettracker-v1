'use client'

import { useEffect } from 'react'
import type { PulseEvent } from '@/lib/events/pulse'

// Gradient configs per theme — Apple-style atmospheric, single color direction
const GRADIENTS: Record<string, { gradient: string; primary: string; secondary: string; text: string }> = {
  football: {
    gradient:  'radial-gradient(ellipse 90% 80% at 50% -10%, rgba(22,90,45,0.55) 0%, transparent 70%)',
    primary:   'rgba(22,90,45,0.3)',
    secondary: 'rgba(22,90,45,0.08)',
    text:      '#4db87a',
  },
  'grass-tennis': {
    gradient:  'radial-gradient(ellipse 90% 80% at 50% -10%, rgba(30,75,45,0.5) 0%, rgba(91,44,141,0.08) 60%, transparent 75%)',
    primary:   'rgba(74,124,89,0.3)',
    secondary: 'rgba(74,124,89,0.08)',
    text:      '#6dbf8a',
  },
  'clay-tennis': {
    gradient:  'radial-gradient(ellipse 90% 80% at 50% -10%, rgba(124,45,18,0.45) 0%, transparent 70%)',
    primary:   'rgba(201,74,46,0.3)',
    secondary: 'rgba(201,74,46,0.08)',
    text:      '#f97316',
  },
  'hard-tennis': {
    gradient:  'radial-gradient(ellipse 90% 80% at 50% -10%, rgba(30,58,95,0.45) 0%, transparent 70%)',
    primary:   'rgba(62,123,250,0.3)',
    secondary: 'rgba(62,123,250,0.08)',
    text:      '#60a5fa',
  },
  basketball: {
    gradient:  'radial-gradient(ellipse 90% 80% at 50% -10%, rgba(124,45,18,0.45) 0%, transparent 70%)',
    primary:   'rgba(234,88,12,0.3)',
    secondary: 'rgba(234,88,12,0.08)',
    text:      '#fb923c',
  },
  hockey: {
    gradient:  'radial-gradient(ellipse 90% 80% at 50% -10%, rgba(30,58,95,0.4) 0%, transparent 70%)',
    primary:   'rgba(96,165,250,0.3)',
    secondary: 'rgba(96,165,250,0.08)',
    text:      '#93c5fd',
  },
  'american-football': {
    gradient:  'radial-gradient(ellipse 90% 80% at 50% -10%, rgba(127,29,29,0.45) 0%, transparent 70%)',
    primary:   'rgba(239,68,68,0.3)',
    secondary: 'rgba(239,68,68,0.08)',
    text:      '#fca5a5',
  },
  esports: {
    gradient:  'radial-gradient(ellipse 90% 80% at 50% -10%, rgba(55,48,163,0.45) 0%, transparent 70%)',
    primary:   'rgba(99,102,241,0.3)',
    secondary: 'rgba(99,102,241,0.08)',
    text:      '#a5b4fc',
  },
  neutral: {
    gradient:  'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(62,123,250,0.1) 0%, transparent 70%)',
    primary:   'rgba(62,123,250,0.2)',
    secondary: 'rgba(62,123,250,0.06)',
    text:      '#3e7bfa',
  },
}

interface Props {
  event: PulseEvent | null
}

export function PulseProvider({ event }: Props) {
  useEffect(() => {
    const root = document.documentElement
    const cfg  = GRADIENTS[event?.theme ?? 'neutral']

    root.style.setProperty('--pulse-gradient',  cfg.gradient)
    root.style.setProperty('--pulse-primary',   cfg.primary)
    root.style.setProperty('--pulse-secondary', cfg.secondary)
    root.style.setProperty('--pulse-text',      cfg.text)
  }, [event])

  return null
}
