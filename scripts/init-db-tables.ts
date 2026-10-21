import { ensureSchema } from '../src/lib/db'

// Runs every migration now, regardless of the recorded schema version. Idempotent.
export async function ensureTables() {
  await ensureSchema(true)
}
