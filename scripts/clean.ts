/**
 * clean.ts — DESTRUCTIVE maintenance utility: empty the paper library.
 *
 * WHAT IT IS:   A manual reset tool, NOT a weekly cron step. It sits outside the
 *               weekly.yml pipeline; you run it by hand to start the library over.
 * WHAT IT DOES: Deletes EVERY row from the Supabase `papers` table (via
 *               .delete().not('id','is',null), which matches all rows). Schema,
 *               tables, functions and other tables (e.g. saved_search) are kept.
 *               Prints the row count before deleting.
 * WORK WITH IT: `npm run clean -- --yes`. The `--yes` flag is mandatory. Not part
 *               of the pipeline order — run it only when you want a clean slate,
 *               after which ingest → ingest:arxiv → … repopulate from scratch.
 * BEHAVIORS:    Reads Supabase service creds through getServiceClient (env from
 *               .env.local locally, or CI/repo secrets). Without `--yes` it refuses
 *               and exits 1 (no delete). A failed delete throws and exits 1.
 * CHANGE IT:    The `--yes` guard is the only safety — do not weaken it. To wipe a
 *               subset instead of everything, add filters to the `.delete()` query
 *               (e.g. .eq('source','arxiv')) rather than matching all rows.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { getServiceClient } from '../src/lib/supabase';

async function main() {
  if (!process.argv.includes('--yes')) {
    console.log('Refusing to delete without confirmation. Re-run: npm run clean -- --yes');
    process.exitCode = 1;
    return;
  }

  const supabase = getServiceClient();
  const { count: before } = await supabase
    .from('papers')
    .select('*', { count: 'exact', head: true });

  const { error } = await supabase.from('papers').delete().not('id', 'is', null);
  if (error) throw new Error(error.message);

  console.log(`🧹 Deleted all papers (was ${before ?? '?'}). The library is empty.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
