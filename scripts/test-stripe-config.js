#!/usr/bin/env node
/**
 * Test Stripe Configuration
 * This script verifies that all Stripe environment variables are correctly configured
 */

const fs = require('fs');
const path = require('path');

const Colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${Colors[color]}${msg}${Colors.reset}`);
}

function checkEnvVar(name, required = true) {
  const value = process.env[name];
  const status = value ? '✅' : '❌';
  const color = value ? 'green' : required ? 'red' : 'yellow';

  log(`${status} ${name}${value ? '' : ' [MISSING]'}`, color);

  if (value && value.length > 10) {
    log(`   └─ Configured: ${value.substring(0, 20)}...`, 'cyan');
  }

  return !!value;
}

function main() {
  log('\n╔════════════════════════════════════════════════════════╗', 'blue');
  log('║      ProFaceApp Stripe Configuration Test              ║', 'blue');
  log('╚════════════════════════════════════════════════════════╝\n', 'blue');

  let allOk = true;

  // Critical Stripe variables
  log('🔐 Critical Stripe Keys:', 'yellow');
  allOk &= checkEnvVar('STRIPE_SECRET_KEY', true);
  allOk &= checkEnvVar('STRIPE_WEBHOOK_SECRET', true);
  allOk &= checkEnvVar('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', true);

  // Stripe Price IDs
  log('\n💰 Stripe Price IDs:', 'yellow');
  const priceIds = [
    'STRIPE_PRICE_STARTER_MONTHLY',
    'STRIPE_PRICE_STARTER_YEARLY',
    'STRIPE_PRICE_PRO_MONTHLY',
    'STRIPE_PRICE_PRO_YEARLY',
    'STRIPE_PRICE_MAX_MONTHLY',
    'STRIPE_PRICE_MAX_YEARLY',
    'STRIPE_PRICE_ONESHOT',
  ];

  for (const priceId of priceIds) {
    const has = checkEnvVar(priceId, true);
    allOk &= has;
  }

  // Supabase configuration
  log('\n🗄️  Supabase Configuration:', 'yellow');
  allOk &= checkEnvVar('NEXT_PUBLIC_SUPABASE_URL', true);
  allOk &= checkEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY', true);
  allOk &= checkEnvVar('SUPABASE_SERVICE_ROLE_KEY', true);

  // Optional: Replicate token
  log('\n🤖 Optional Configuration:', 'yellow');
  checkEnvVar('REPLICATE_API_TOKEN', false);

  // App URL
  log('\n🌐 App Configuration:', 'yellow');
  checkEnvVar('NEXT_PUBLIC_APP_URL', true);

  // Summary
  console.log('');
  if (allOk) {
    log('✅ All critical environment variables are configured!', 'green');
    process.exit(0);
  } else {
    log('❌ Missing critical environment variables', 'red');
    log('\nTo fix:', 'yellow');
    log('1. Open Vercel Dashboard: https://vercel.com/dashboard', 'cyan');
    log('2. Select: profaceapp-2026-u2zi', 'cyan');
    log('3. Go to: Settings → Environment Variables', 'cyan');
    log('4. Add missing variables', 'cyan');
    process.exit(1);
  }
}

main();
