#!/usr/bin/env bash
#
# Adds the production secrets the API needs for email and media uploads.
#
# Values are read from the terminal without echo and piped straight into the
# Vercel CLI, so they never appear in shell history, this script's output or
# the repository. Run it from the repository root:
#
#   ./scripts/setup-production-secrets.sh
#
# Re-running it is safe: existing values are replaced with --force.

set -euo pipefail

ENVIRONMENT="${1:-production}"

if ! command -v vercel >/dev/null 2>&1; then
  echo "The Vercel CLI is required. Install it with: npm i -g vercel" >&2
  exit 1
fi

if [ ! -f .vercel/project.json ]; then
  echo "This directory is not linked to a Vercel project. Run: vercel link" >&2
  exit 1
fi

ask() {
  local name="$1" hint="$2" value=""
  printf '%s\n' "$hint"
  printf 'Paste %s (leave blank to skip): ' "$name" >&2
  read -rs value
  printf '\n' >&2
  if [ -z "$value" ]; then
    echo "  skipped $name"
    return
  fi
  if ! printf '%s' "$value" | vercel env add "$name" "$ENVIRONMENT" --sensitive --force >/dev/null 2>&1; then
    echo "  FAILED to set $name" >&2
    FAILED=1
    return
  fi
  echo "  set $name"
}

FAILED=0

echo "Re-EL ECD: $ENVIRONMENT secrets"
echo "Nothing you paste is printed or saved locally."
echo

ask RESEND_API_KEY "Resend API key (https://resend.com/api-keys). The sender domain must be verified."
echo
ask R2_ACCOUNT_ID "Cloudflare account id (R2 overview page)."
ask R2_ACCESS_KEY_ID "R2 API token access key id (Object Read & Write)."
ask R2_SECRET_ACCESS_KEY "R2 API token secret access key."
ask R2_BUCKET "R2 bucket name."
ask R2_PUBLIC_BASE_URL "Public bucket origin, e.g. https://media.re-el.co.za (no trailing slash)."

echo
if [ "$FAILED" -ne 0 ]; then
  echo "Some values could not be saved. Check the Vercel CLI output and try again." >&2
  exit 1
fi

echo "Secrets saved. Redeploying $ENVIRONMENT..."
vercel --prod --yes >/dev/null

echo "Redeployed. Open the app as a platform admin and check Platform -> Health:"
echo "email.configured and storage.configured should both be true."
