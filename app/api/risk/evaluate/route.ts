import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'
import { bucketStake, bucketPercent } from '@/lib/analytics/buckets'

const requestSchema = z.object({
  stake:       z.number().positive(),
  decision_id: z.string().uuid().optional(),
})

// Default recommended max stake: 2% of bankroll
const RECOMMENDED_MAX_PCT = 0.02

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { stake, decision_id } = parsed.data

    await trackServerEvent(user.id, EVENTS.RISK_EVALUATION_REQUESTED, {
      stake_bucket:    bucketStake(stake),
      has_decision_id: !!decision_id,
    })

    // Fetch default bankroll balance
    const { data: bankroll } = await supabase
      .from('bankrolls')
      .select('balance')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single()

    if (!bankroll) {
      return NextResponse.json({ success: false, error: 'Bankroll not found' }, { status: 404 })
    }
    const balance = Number(bankroll.balance)

    // Sum pending bet stakes
    const { data: pendingBets } = await supabase
      .from('bets')
      .select('stake')
      .eq('user_id', user.id)
      .eq('status', 'pending')
    const pendingExposure = (pendingBets ?? []).reduce((s, b) => s + Number(b.stake), 0)

    // Optionally load decision confidence/risk context
    let decision: { confidence_score: number | null; risk_level: string | null } | null = null
    if (decision_id) {
      const { data } = await supabase
        .from('decisions')
        .select('confidence_score, risk_level')
        .eq('id', decision_id)
        .eq('user_id', user.id)
        .single()
      decision = data ?? null
    }

    // ── Calculations ──────────────────────────────────────────
    // All percentages are relative to current bankroll balance
    const stakePercent   = balance > 0 ? (stake / balance) * 100              : 100
    const pendingPercent = balance > 0 ? (pendingExposure / balance) * 100    : 0
    const totalExposure  = balance > 0 ? ((pendingExposure + stake) / balance) * 100 : 100

    let riskLevel: 'low' | 'medium' | 'high' | 'very_high'
    if      (stakePercent <= 1) riskLevel = 'low'
    else if (stakePercent <= 3) riskLevel = 'medium'
    else if (stakePercent <= 5) riskLevel = 'high'
    else                        riskLevel = 'very_high'

    // Start from 2% baseline; reduce if decision context signals elevated risk
    let recommendedMaxStake = balance * RECOMMENDED_MAX_PCT
    if (decision?.risk_level === 'high')                                                 recommendedMaxStake *= 0.5
    if (decision?.confidence_score != null && decision.confidence_score < 50)           recommendedMaxStake *= 0.75
    recommendedMaxStake = Math.round(recommendedMaxStake * 100) / 100

    const warnings: string[] = []
    if      (riskLevel === 'very_high') warnings.push('This stake is over 5% of your bankroll — well above disciplined sizing limits.')
    else if (riskLevel === 'high')      warnings.push('This stake is over 3% of your bankroll. Consider reducing it.')
    if      (pendingPercent > 20) warnings.push('Your current open bets already represent over 20% of your bankroll.')
    else if (pendingPercent > 10) warnings.push('Your open bets represent over 10% of your bankroll.')
    if (decision?.risk_level === 'high')                                                 warnings.push('The AI rated this opportunity as high risk.')
    if (decision?.confidence_score != null && decision.confidence_score < 50)           warnings.push(`AI confidence is ${decision.confidence_score}% — below the recommended threshold.`)

    await trackServerEvent(user.id, EVENTS.RISK_EVALUATION_COMPLETED, {
      risk_level:              riskLevel,
      stake_bucket:            bucketStake(stake),
      stake_pct_bucket:        bucketPercent(stakePercent),
      pending_exposure_bucket: bucketPercent(pendingPercent),
      warning_count:           warnings.length,
      has_decision:            !!decision,
    })

    return NextResponse.json({
      success: true,
      data: {
        risk_level:                riskLevel,
        stake_percent_of_bankroll: parseFloat(stakePercent.toFixed(2)),
        pending_exposure_percent:  parseFloat(pendingPercent.toFixed(2)),
        total_exposure_after_bet:  parseFloat(totalExposure.toFixed(2)),
        recommended_max_stake:     recommendedMaxStake,
        warnings,
        disclaimer:                'Risk evaluation is informational only. Always bet within your means.',
      },
    })

  } catch (err: unknown) {
    console.error('[risk/evaluate] unhandled error:', err instanceof Error ? err.name : 'unknown')
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
