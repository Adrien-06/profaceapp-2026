#!/usr/bin/env node
/**
 * Repairs Supabase migration history table
 * Fixes "Remote migration versions not found in local migrations directory" error
 *
 * Usage (on your local machine with .env.local set):
 *   node supabase/repair-migrations.js
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCAL_VERSION = '20250101000000';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Missing environment variables:');
    console.error('   NEXT_PUBLIC_SUPABASE_URL');
    console.error('   SUPABASE_SERVICE_ROLE_KEY');
    console.error('\nSet them in .env.local before running this script.');
    process.exit(1);
}

async function repairMigrations() {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

        console.log('🔍 Checking migration history...\n');

        // List remote migration history
        const { data: migrations, error: listErr } = await supabase
            .from('supabase_migrations')
            .select('version')
            .order('version', { ascending: true });

        if (listErr) {
            // Table might not exist — that's OK, we'll create the entry
            console.log('   No migration history found (this is OK).');
        } else if (migrations && migrations.length > 0) {
            console.log('📋 Remote migration versions:');
            migrations.forEach(m => console.log(`   - ${m.version}`));
            console.log();
        }

        // Delete orphan versions (keep only the current one)
        console.log(`🗑️  Cleaning up orphan versions (keeping only ${LOCAL_VERSION})...`);
        const { error: deleteErr } = await supabase
            .from('supabase_migrations')
            .delete()
            .neq('version', LOCAL_VERSION);

        if (deleteErr && deleteErr.code !== 'PGRST116') {
            // PGRST116 = "no rows", which is fine
            console.warn(`   ⚠️  Warning: ${deleteErr.message}`);
        } else {
            console.log('   ✓ Orphan versions removed');
        }

        // Upsert the current migration version as applied
        console.log(`\n✅ Marking ${LOCAL_VERSION} as applied...`);
        const { error: upsertErr } = await supabase
            .from('supabase_migrations')
            .upsert({
                version: LOCAL_VERSION,
                statements: [],
                name: 'initial',
                execution_time_ms: 0,
            }, { onConflict: 'version' });

        if (upsertErr) {
            console.error(`❌ Error: ${upsertErr.message}`);
            process.exit(1);
        }

        console.log('   ✓ Migration marked as applied');

        // Final verification
        console.log('\n📋 Verifying final state...');
        const { data: finalMigrations } = await supabase
            .from('supabase_migrations')
            .select('version')
            .order('version', { ascending: true });

        if (finalMigrations && finalMigrations.length > 0) {
            console.log('Remote migrations now:');
            finalMigrations.forEach(m => console.log(`   - ${m.version}`));
        }

        console.log('\n✨ Migration repair complete!');
        console.log('Your Supabase migrations are now in sync.\n');
    } catch (err) {
        console.error('❌ Error during repair:', err.message);
        process.exit(1);
    }
}

repairMigrations();
