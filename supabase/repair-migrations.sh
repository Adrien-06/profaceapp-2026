#!/bin/bash
# Supabase migration repair script
# Fixes "Remote migration versions not found in local migrations directory" error
#
# This script:
# 1. Lists local vs remote migrations to identify orphans
# 2. Marks all orphan remote versions as reverted (removes them from history)
# 3. Marks the local migration 20250101000000 as applied (schema already exists)

set -e

echo "🔍 Checking Supabase CLI..."
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it:"
    echo "   npm install -g supabase"
    exit 1
fi

echo ""
echo "📋 Local vs Remote migrations:"
supabase migration list
echo ""

echo "🔧 Repairing migration history..."
echo ""

# The local migration version after the rename
LOCAL_VERSION="20250101000000"

# Get the list of remote migrations (parse output from 'migration list')
# This requires manual inspection for now. The script will prompt the user.
echo "⚠️  Please check the 'migration list' output above."
echo ""
echo "If you see REMOTE versions that are NOT in LOCAL, enter them below."
echo "Example: If remote shows '001', type: 001"
echo "Press Enter with empty input when done."
echo ""

declare -a REMOTE_ORPHANS

while true; do
    read -p "Enter orphan remote version (or press Enter to skip): " orphan
    if [ -z "$orphan" ]; then
        break
    fi
    REMOTE_ORPHANS+=("$orphan")
done

# Mark orphans as reverted
if [ ${#REMOTE_ORPHANS[@]} -gt 0 ]; then
    echo ""
    echo "🗑️  Removing orphan remote versions..."
    for version in "${REMOTE_ORPHANS[@]}"; do
        echo "   - Reverting version $version"
        supabase migration repair --status reverted "$version"
    done
fi

echo ""
echo "✅ Marking local migration as applied..."
supabase migration repair --status applied "$LOCAL_VERSION"

echo ""
echo "🎉 Repair complete! Verifying..."
supabase migration list
echo ""
echo "✨ All done. Your migrations should now be in sync."
