/**
 * PaperPicks — clean (DESTRUCTIVE)
 * ------------------------------------------------------------------
 * Deletes ALL rows from `papers` so the pipeline can repopulate from scratch.
 * Keeps the schema/tables/functions. Requires an explicit --yes.
 *
 * Usage:  npm run clean -- --yes
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
