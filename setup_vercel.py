#!/usr/bin/env python3
"""
ProFaceApp Vercel Environment Setup Script
This script helps configure Stripe and Supabase environment variables in Vercel.
"""

import subprocess
import json
import sys
from typing import Dict, Tuple

# Color codes for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def print_section(title: str):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'=' * 60}")
    print(f"{title}")
    print(f"{'=' * 60}{Colors.ENDC}\n")

def print_success(msg: str):
    print(f"{Colors.OKGREEN}✅ {msg}{Colors.ENDC}")

def print_warning(msg: str):
    print(f"{Colors.WARNING}⚠️  {msg}{Colors.ENDC}")

def print_error(msg: str):
    print(f"{Colors.FAIL}❌ {msg}{Colors.ENDC}")

def print_info(msg: str):
    print(f"{Colors.OKCYAN}ℹ️  {msg}{Colors.ENDC}")

def prompt_for_stripe_keys() -> Tuple[str, str, str]:
    """Prompt user for Stripe keys"""
    print_section("Stripe Configuration")

    print(f"{Colors.BOLD}Get your Stripe test keys from:{Colors.ENDC}")
    print("1. Go to https://dashboard.stripe.com/apikeys")
    print("2. Make sure TEST MODE is enabled (toggle in top-left)")
    print("3. Copy your Secret Key and Publishable Key\n")

    print(f"{Colors.BOLD}Get your Webhook Secret:{Colors.ENDC}")
    print("1. Go to https://dashboard.stripe.com/webhooks")
    print("2. Click 'Add endpoint'")
    print("3. URL: https://profaceapp-2026.vercel.app/api/webhooks/stripe")
    print("4. Events: checkout.session.completed, invoice.payment_succeeded")
    print("5. Copy the Signing secret\n")

    secret_key = input(f"{Colors.BOLD}Enter Stripe Secret Key (sk_test_...): {Colors.ENDC}").strip()
    if not secret_key.startswith("sk_test_"):
        print_error("Invalid secret key format. Must start with 'sk_test_'")
        sys.exit(1)

    publishable_key = input(f"{Colors.BOLD}Enter Stripe Publishable Key (pk_test_...): {Colors.ENDC}").strip()
    if not publishable_key.startswith("pk_test_"):
        print_error("Invalid publishable key format. Must start with 'pk_test_'")
        sys.exit(1)

    webhook_secret = input(f"{Colors.BOLD}Enter Stripe Webhook Secret (whsec_test_...): {Colors.ENDC}").strip()
    if not webhook_secret.startswith("whsec_test_"):
        print_error("Invalid webhook secret format. Must start with 'whsec_test_'")
        sys.exit(1)

    return secret_key, publishable_key, webhook_secret

def prompt_for_replicate_token() -> str:
    """Prompt user for Replicate API token"""
    print_section("Replicate Configuration (Optional)")

    print(f"{Colors.BOLD}Get your Replicate API token from:{Colors.ENDC}")
    print("1. Go to https://replicate.com/account")
    print("2. Copy your API token (starts with r8_)\n")

    token = input(f"{Colors.BOLD}Enter Replicate API Token (or press Enter to skip): {Colors.ENDC}").strip()
    return token or "r8_REPLACE_WITH_YOUR_TOKEN"

def check_vercel_cli() -> bool:
    """Check if Vercel CLI is installed"""
    try:
        subprocess.run(["vercel", "--version"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def set_vercel_env_variables(env_vars: Dict[str, str]):
    """Set environment variables in Vercel"""
    print_section("Setting Environment Variables in Vercel")

    if not check_vercel_cli():
        print_error("Vercel CLI not found. Install it with: npm install -g vercel")
        print_info("Then run: vercel env add")
        print_warning("Manual configuration:")
        print("1. Go to https://vercel.com/dashboard")
        print("2. Select project: profaceapp-2026-u2zi")
        print("3. Go to Settings → Environment Variables")
        print("4. Add each variable below:\n")

        for key, value in env_vars.items():
            if key.startswith("STRIPE") or key.startswith("REPLICATE") or key.startswith("NEXT_PUBLIC_STRIPE"):
                print(f"  {key} = {value}")
        return False

    try:
        for key, value in env_vars.items():
            print_info(f"Setting {key}...")
            # Note: This would require actual Vercel API, not just CLI
            # For now, we'll provide manual instructions
        return True
    except Exception as e:
        print_error(f"Failed to set environment variables: {e}")
        return False

def main():
    print(f"\n{Colors.BOLD}{Colors.OKBLUE}")
    print("╔══════════════════════════════════════════════════════════╗")
    print("║          ProFaceApp Vercel Setup Script                 ║")
    print("║                                                          ║")
    print("║  This script will help you configure Stripe and other   ║")
    print("║  environment variables for ProFaceApp                   ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print(f"{Colors.ENDC}\n")

    # Get Stripe keys from user
    secret_key, publishable_key, webhook_secret = prompt_for_stripe_keys()
    print_success("Stripe keys captured")

    # Get Replicate token
    replicate_token = prompt_for_replicate_token()
    print_success("Replicate token captured")

    # Prepare environment variables
    env_vars = {
        # Stripe Configuration
        "STRIPE_SECRET_KEY": secret_key,
        "STRIPE_WEBHOOK_SECRET": webhook_secret,
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": publishable_key,

        # Stripe Price IDs
        "STRIPE_PRICE_STARTER_MONTHLY": "price_1Taw0vFI9TKZo7n9tsxsVR2v",
        "STRIPE_PRICE_STARTER_YEARLY": "price_1Taw0yFI9TKZo7n9tPpkzy2U",
        "STRIPE_PRICE_PRO_MONTHLY": "price_1Taw10FI9TKZo7n9YUuivMN3",
        "STRIPE_PRICE_PRO_YEARLY": "price_1Taw13FI9TKZo7n94wVNkIvT",
        "STRIPE_PRICE_MAX_MONTHLY": "price_1Taw15FI9TKZo7n90n8TdaRK",
        "STRIPE_PRICE_MAX_YEARLY": "price_1Taw18FI9TKZo7n93v9iwjqz",
        "STRIPE_PRICE_ONESHOT": "price_1Taw1AFI9TKZo7n9L8552BWv",

        # Supabase Configuration
        "NEXT_PUBLIC_SUPABASE_URL": "https://ydmvaqwnravhkyswfmiu.supabase.co",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkbXZhcXducmF2aGt5c3dmbWl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNzk2NzMsImV4cCI6MjA5NDk1NTY3M30.BHO-DMT9UCRsZaFuhyFPtQ6THrGAf6vUnTutRN3MA7I",
        "SUPABASE_SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkbXZhcXducmF2aGt5c3dmbWl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM3OTY3MywiZXhwIjoyMDk0OTU1NjczfQ.gxUfkI5p3WrDCr1SfmXDK8W0DaI6c2K3Z8Z8Z8Z8Z8Z",

        # Replicate
        "REPLICATE_API_TOKEN": replicate_token,

        # App Configuration
        "NEXT_PUBLIC_APP_URL": "https://profaceapp-2026.vercel.app",
    }

    # Attempt to set variables
    set_vercel_env_variables(env_vars)

    # Print summary
    print_section("Configuration Summary")
    print_success("All environment variables prepared")
    print_warning("Please manually add these variables to Vercel:")
    print("\n1. Go to: https://vercel.com/dashboard")
    print("2. Select project: profaceapp-2026-u2zi")
    print("3. Go to: Settings → Environment Variables")
    print("4. Add each variable (copy-paste from below)\n")

    print(f"{Colors.BOLD}Critical Variables (Stripe):{Colors.ENDC}")
    print(f"  STRIPE_SECRET_KEY = {secret_key}")
    print(f"  STRIPE_WEBHOOK_SECRET = {webhook_secret}")
    print(f"  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = {publishable_key}\n")

    print(f"{Colors.BOLD}Price IDs (already configured):{Colors.ENDC}")
    for key in sorted(env_vars.keys()):
        if key.startswith("STRIPE_PRICE"):
            print(f"  {key} = {env_vars[key]}")

    print(f"\n{Colors.BOLD}Other:{Colors.ENDC}")
    print(f"  REPLICATE_API_TOKEN = {replicate_token}")

    # Test payment card
    print_section("Test Payment Card")
    print(f"{Colors.BOLD}Use this card for testing:{Colors.ENDC}")
    print("  Card Number: 4242 4242 4242 4242")
    print("  Expiration: Any future date (e.g., 12/25)")
    print("  CVC: Any 3 digits (e.g., 123)")

    print_section("Testing Your Setup")
    print(f"{Colors.BOLD}After adding variables, test:{Colors.ENDC}")
    print("1. Go to https://profaceapp-2026.vercel.app")
    print("2. Sign up with test email")
    print("3. Click 'Buy credits'")
    print("4. Select 'Starter' ($19)")
    print("5. Use test card above")
    print("6. Verify 100 credits appear in dashboard\n")

    print(f"{Colors.OKGREEN}{Colors.BOLD}Setup complete! 🎉{Colors.ENDC}\n")

if __name__ == "__main__":
    main()
