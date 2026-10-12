#!/usr/bin/env bash
# ==============================================================================
# GHA Local Directory & Multi-Repository GitHub Sync Script
# Local Layout under /Users/jayakumar/project/gha/mobile-app/code:
#   - service/gha-event-service  -> https://github.com/JKCBase/app-eventservice.git
#   - service/gha-gateway        -> https://github.com/JKCBase/app-gateway.git
#   - ui/admin                   -> https://github.com/JKCBase/app-admin.git
#   - ui/app                     -> https://github.com/JKCBase/ghaapp.git
#
# One-Line Pull Command (run from anywhere on your Mac):
#   mkdir -p /Users/jayakumar/project/gha/mobile-app/code && curl -sL "https://ais-pre-nalo436zjzydnmabqditbg-972826387012.asia-southeast1.run.app/api/v1/events/export/gha-platform-bundle.tar.gz" | tar -xz -C /Users/jayakumar/project/gha/mobile-app/code
# ==============================================================================

set -euo pipefail

LOCAL_CODE_ROOT="${LOCAL_CODE_ROOT:-/Users/jayakumar/project/gha/mobile-app/code}"
GITHUB_OWNER="${GITHUB_OWNER:-JKCBase}"
GATEWAY_REPO="${GATEWAY_REPO:-app-gateway}"
BRANCH="${BRANCH:-main}"
WORK_DIR="$(mktemp -d)"

echo "=================================================================="
echo "Syncing GHA Platform from ${LOCAL_CODE_ROOT} to GitHub (${GITHUB_OWNER})"
echo "=================================================================="

# 1. Sync Mobile App (/ui/app) -> JKCBase/ghaapp
echo "[1/4] Pushing /ui/app -> ${GITHUB_OWNER}/ghaapp ..."
GHAAPP_DIR="${WORK_DIR}/ghaapp"
mkdir -p "${GHAAPP_DIR}"
cp -R "${LOCAL_CODE_ROOT}/ui/app/." "${GHAAPP_DIR}/"
cd "${GHAAPP_DIR}"
git init -b "${BRANCH}"
git add .
git commit -m "feat(mobile): GHA Mobile App Landing Page & In-App Browser redirect"
git remote add origin "https://github.com/${GITHUB_OWNER}/ghaapp.git"
git push -u origin "${BRANCH}" --force

# 2. Sync Event Service (/service/gha-event-service) -> JKCBase/app-eventservice
echo "[2/4] Pushing /service/gha-event-service -> ${GITHUB_OWNER}/app-eventservice ..."
EVENT_SVC_DIR="${WORK_DIR}/app-eventservice"
mkdir -p "${EVENT_SVC_DIR}"
cp -R "${LOCAL_CODE_ROOT}/service/gha-event-service/." "${EVENT_SVC_DIR}/"
cp "${LOCAL_CODE_ROOT}/service/podman-compose.yml" "${EVENT_SVC_DIR}/"
cd "${EVENT_SVC_DIR}"
git init -b "${BRANCH}"
git add .
git commit -m "feat(event-service): Java 17 GHA Event Service (4-card rule, optional URL, year pagination)"
git remote add origin "https://github.com/${GITHUB_OWNER}/app-eventservice.git"
git push -u origin "${BRANCH}" --force

# 3. Sync Gateway (/service/gha-gateway) -> JKCBase/app-gateway
echo "[3/4] Pushing /service/gha-gateway -> ${GITHUB_OWNER}/${GATEWAY_REPO} ..."
GATEWAY_DIR="${WORK_DIR}/${GATEWAY_REPO}"
mkdir -p "${GATEWAY_DIR}"
cp -R "${LOCAL_CODE_ROOT}/service/gha-gateway/." "${GATEWAY_DIR}/"
cp "${LOCAL_CODE_ROOT}/service/podman-compose.yml" "${GATEWAY_DIR}/"
cd "${GATEWAY_DIR}"
git init -b "${BRANCH}"
git add .
git commit -m "feat(gateway): Java 17 Spring Cloud Gateway with Eureka & correlation filter"
git remote add origin "https://github.com/${GITHUB_OWNER}/${GATEWAY_REPO}.git"
git push -u origin "${BRANCH}" --force

# 4. Sync Desktop Admin UI (/ui/admin) -> JKCBase/app-admin
echo "[4/4] Pushing /ui/admin -> ${GITHUB_OWNER}/app-admin ..."
ADMIN_DIR="${WORK_DIR}/app-admin"
mkdir -p "${ADMIN_DIR}"
cp -R "${LOCAL_CODE_ROOT}/ui/admin/." "${ADMIN_DIR}/"
cd "${ADMIN_DIR}"
git init -b "${BRANCH}"
git add .
git commit -m "feat(admin-ui): GHA Desktop Admin Console, 4-card rule & historical re-publish"
git remote add origin "https://github.com/${GITHUB_OWNER}/app-admin.git"
git push -u origin "${BRANCH}" --force

echo "=================================================================="
echo "All 4 repositories synced from ${LOCAL_CODE_ROOT}"
echo "=================================================================="
