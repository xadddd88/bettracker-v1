import tokens from '@/design-system/broadcast-noir.v3.1.json'

export const broadcastNoir = tokens
export const broadcastNoirColors = tokens.colors
export const broadcastNoirGeometry = tokens.geometry
export const broadcastNoirMotion = tokens.motion
export const broadcastNoirTypography = tokens.typography

export type BroadcastNoirColor = keyof typeof tokens.colors
export type BroadcastNoirStatus = 'success' | 'review' | 'negative' | 'neutral'
