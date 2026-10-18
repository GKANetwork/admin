#!/usr/bin/env bash
# ==============================================================================
# GHA Multi-Repository GitHub Sync Script (GKANetwork)
# Repositories under https://github.com/GKANetwork:
#   1. Event Service    -> https://github.com/GKANetwork/gha-event-service.git
#   2. API Gateway      -> https://github.com/GKANetwork/gha-gateway.git
#   3. Desktop Admin UI -> https://github.com/GKANetwork/admin.git
#   4. Mobile App       -> https://github.com/GKANetwork/app.git
#
# Local Clone / Pull Setup for /Users/jayakumar/project/gha/mobile-app/code:
#   mkdir -p /Users/jayakumar/project/gha/mobile-app/code/service /Users/jayakumar/project/gha/mobile-app/code/ui
#   git clone https://github.com/GKANetwork/gha-event-service.git /Users/jayakumar/project/gha/mobile-app/code/service/gha-event-service
#   git clone https://github.com/GKANetwork/gha-gateway.git       /Users/jayakumar/project/gha/mobile-app/code/service/gha-gateway
#   git clone https://github.com/GKANetwork/admin.git             /Users/jayakumar/project/gha/mobile-app/code/ui/admin
#   git clone https://github.com/GKANetwork/app.git               /Users/jayakumar/project/gha/mobile-app/code/ui/app
# ==============================================================================

set -euo pipefail

LOCAL_CODE_ROOT="${LOCAL_CODE_ROOT:-/Users/jayakumar/project/gha/mobile-app/code}"

echo "Pulling latest main branch across all 4 GKANetwork repositories in ${LOCAL_CODE_ROOT}..."

for REPO_PATH in \
  "${LOCAL_CODE_ROOT}/service/gha-event-service" \
  "${LOCAL_CODE_ROOT}/service/gha-gateway" \
  "${LOCAL_CODE_ROOT}/ui/admin" \
  "${LOCAL_CODE_ROOT}/ui/app"; do
  if [ -d "${REPO_PATH}/.git" ]; then
    echo "-> git pull in ${REPO_PATH}"
    git -C "${REPO_PATH}" pull origin main
  fi
done

echo "✅ All local repositories updated!"
