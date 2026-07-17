import { getSupabase } from '@/lib/supabase';
import { type BetDto, mapBetRow } from '@/bets/models';
import { ReadModelError, sanitizeReadError } from '@/bets/errors';

const BET_COLUMNS = `
  id,
  bet_type,
  stake,
  total_odds,
  potential_payout,
  status,
  pnl,
  placed_at,
  settled_at,
  bookmaker,
  source,
  notes,
  legs:bet_legs(
    id,
    sport,
    event_name,
    market_type,
    selection,
    odds,
    leg_status,
    leg_index
  )
`;

export async function fetchCurrency(userId: string): Promise<string> {
  const { data, error } = await getSupabase()
    .from('bankrolls')
    .select('currency')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  if (error) throw sanitizeReadError(error.message, error.code);
  return typeof data?.currency === 'string' ? data.currency : 'USD';
}

export async function fetchBets(userId: string): Promise<BetDto[]> {
  const { data, error } = await getSupabase()
    .from('bets')
    .select(BET_COLUMNS)
    .eq('user_id', userId)
    .order('placed_at', { ascending: false })
    .order('leg_index', { ascending: true, referencedTable: 'bet_legs' });
  if (error) throw sanitizeReadError(error.message, error.code);
  return (data ?? []).map((row) => mapBetRow(row as never));
}

export async function fetchBet(userId: string, id: string): Promise<BetDto> {
  const { data, error } = await getSupabase()
    .from('bets')
    .select(BET_COLUMNS)
    .eq('user_id', userId)
    .eq('id', id)
    .order('leg_index', { ascending: true, referencedTable: 'bet_legs' })
    .maybeSingle();
  if (error) throw sanitizeReadError(error.message, error.code);
  if (!data) throw new ReadModelError('not_found');
  return mapBetRow(data as never);
}
