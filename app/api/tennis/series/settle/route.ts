import { runTennisWrite } from '@/lib/tennis/server-write'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  return runTennisWrite(req, 'settle')
}
