# Supabase Setup & Migration Repair

## Issue: "Remote migration versions not found in local migrations directory"

This error occurs when the Supabase remote DB has migration history entries that don't match local migration files.

### Root Cause
- Local migration was renamed from `001_initial.sql` → `20250101000000_initial.sql` (Supabase CLI requires timestamp format)
- Remote DB may have orphan version entries from previous setups

### Solution (Choose One)

#### **Option A: CLI Commands (Recommended if you have `supabase` CLI installed locally)**

1. **On your local machine**, pull the latest code:
   ```bash
   git pull origin main
   ```

2. **Check migration status**:
   ```bash
   supabase migration list
   ```
   Look at the output. Anything in the **REMOTE** column but NOT in LOCAL is an orphan.

3. **Remove each orphan version** (replace `VERSION` with actual version from step 2):
   ```bash
   supabase migration repair --status reverted VERSION
   ```
   Repeat for each orphan version.

4. **Mark the new local migration as applied**:
   ```bash
   supabase migration repair --status applied 20250101000000
   ```

5. **Verify everything is synced**:
   ```bash
   supabase migration list
   ```
   LOCAL and REMOTE columns should now match.

---

#### **Option B: Direct SQL (If you prefer the Supabase Dashboard)**

1. Go to your **Supabase Dashboard** → **SQL Editor**

2. **First, check what's in the migration history table**:
   ```sql
   SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
   ```
   Note any versions you see.

3. **If there are orphan versions** (older than `20250101000000`), remove them:
   ```sql
   DELETE FROM supabase_migrations.schema_migrations 
   WHERE version != '20250101000000';
   ```

4. **Ensure the current migration is recorded**:
   ```sql
   INSERT INTO supabase_migrations.schema_migrations 
     (version, statements, name, execution_time_ms) 
   VALUES ('20250101000000', '{}', 'initial', 0) 
   ON CONFLICT (version) DO NOTHING;
   ```

5. **Verify**:
   ```sql
   SELECT version FROM supabase_migrations.schema_migrations;
   ```
   Should only show `20250101000000`.

---

## After Repair

Once either option is complete:

1. **Locally**, you can now run**:
   ```bash
   supabase db pull          # Safe: pulls schema changes from remote (if any)
   supabase db push          # Pushes local migrations to remote (if needed)
   ```

2. **Deploy**: Your app will now work correctly with Supabase migrations.

---

## Notes

- **Option B (SQL)** never modifies your tables or data — only the `supabase_migrations.schema_migrations` history table.
- The actual database schema (`CREATE TABLE profiles`, etc.) already exists remotely from the initial setup.
- If you see **unexpected errors** after repair, check the [Supabase Docs](https://supabase.com/docs/guides/cli/local-development) on migrations.

---

## Setup Checklist

- [ ] Pull latest code with renamed migration file (`20250101000000_initial.sql`)
- [ ] Run migration repair via CLI or SQL
- [ ] Verify `supabase migration list` shows LOCAL and REMOTE in sync
- [ ] Test: `supabase db pull` (should succeed)
- [ ] Confirm app deploys and Supabase functions work
