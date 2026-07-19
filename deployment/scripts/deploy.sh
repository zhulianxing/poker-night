#!/bin/bash
# Poker Night 一键部署脚本
# 用法: ./deploy.sh [--skip-apk] [--skip-npm]

set -e

# ============================================
# Configuration
# ============================================
SERVER="root@43.164.130.145"
REMOTE_DIR="/opt/poker-night"
LOCAL_DIR="/Users/mac/Documents/Codex/poker-night"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# Parse Arguments
# ============================================
SKIP_APK=false
SKIP_NPM=false

for arg in "$@"; do
    case $arg in
        --skip-apk) SKIP_APK=true ;;
        --skip-npm) SKIP_NPM=true ;;
    esac
done

# ============================================
# Helper Functions
# ============================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================
# Deploy Steps
# ============================================
echo ""
echo "============================================"
echo "   Poker Night Deployment Script"
echo "============================================"
echo ""

# 1. Sync Server Code
log_info "Syncing server code..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '*/build' \
    --exclude '*/.gradle' \
    --exclude '*.apk' \
    --exclude '.env' \
    --exclude 'deployment' \
    $LOCAL_DIR/server/ $SERVER:$REMOTE_DIR/server/

log_success "Server code synced"

# 2. Sync Shared Modules
log_info "Syncing shared modules..."
rsync -avz $LOCAL_DIR/shared/ $SERVER:$REMOTE_DIR/shared/ 2>/dev/null || true

# 3. Sync PM2 Config
log_info "Syncing PM2 config..."
rsync -avz $LOCAL_DIR/deployment/pm2/ecosystem.config.js $SERVER:$REMOTE_DIR/

# 4. Sync APK Files (if not skipped)
if [ "$SKIP_APK" = false ]; then
    log_info "Syncing APK files..."
    
    # Create APK directory
    ssh $SERVER "mkdir -p $REMOTE_DIR/public/apk"
    
    # TV Display APK
    if [ -f "$LOCAL_DIR/tv-display/app/build/outputs/apk/release/app-release.apk" ]; then
        rsync -avz \
            $LOCAL_DIR/tv-display/app/build/outputs/apk/release/app-release.apk \
            $SERVER:$REMOTE_DIR/public/apk/poker-night-tv.apk
        log_success "TV Display APK synced"
    else
        log_warning "TV Display APK not found, skipping..."
    fi
    
    # Player App APK
    if [ -f "$LOCAL_DIR/player-app/app/build/outputs/apk/release/app-release.apk" ]; then
        rsync -avz \
            $LOCAL_DIR/player-app/app/build/outputs/apk/release/app-release.apk \
            $SERVER:$REMOTE_DIR/public/apk/poker-night-player.apk
        log_success "Player App APK synced"
    else
        log_warning "Player App APK not found, skipping..."
    fi
else
    log_warning "Skipping APK sync (--skip-apk)"
fi

# 5. Sync Public Files
log_info "Syncing public files..."
rsync -avz $LOCAL_DIR/public/ $SERVER:$REMOTE_DIR/public/

# 6. Install Dependencies (if not skipped)
if [ "$SKIP_NPM" = false ]; then
    log_info "Installing dependencies..."
    ssh $SERVER "cd $REMOTE_DIR && npm ci --production"
    log_success "Dependencies installed"
else
    log_warning "Skipping npm install (--skip-npm)"
fi

# 7. Restart Services
log_info "Restarting PM2 services..."
ssh $SERVER "cd $REMOTE_DIR && pm2 restart ecosystem.config.js"
log_success "Services restarted"

# 8. Show Status
log_info "Service status:"
ssh $SERVER "pm2 list"

echo ""
log_success "============================================"
log_success "   Deployment Complete!"
log_success "============================================"
echo ""
echo "Services:"
echo "  - API:      http://43.164.130.145:3010"
echo "  - Socket:   http://43.164.130.145:3001"
echo "  - Payment:  http://43.164.130.145:3002"
echo "  - Merchant: http://43.164.130.145:3003"
echo ""
echo "Downloads: http://43.164.130.145/"
echo ""
