#!/bin/bash
# Poker Night Database Backup Script
# 用法: ./backup.sh [--upload]

set -e

# ============================================
# Configuration
# ============================================
SERVER="root@43.164.130.145"
DB_HOST="127.0.0.1"
DB_PORT="5432"
DB_NAME="poker_night"
DB_USER="poker"
DB_PASS="poker123"

LOCAL_BACKUP_DIR="/Users/mac/Documents/Codex/poker-night/backups"
REMOTE_BACKUP_DIR="/opt/poker-night/backups"

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="poker_night_$DATE.sql.gz"

# ============================================
# Parse Arguments
# ============================================
UPLOAD=false

for arg in "$@"; do
    case $arg in
        --upload) UPLOAD=true ;;
    esac
done

# ============================================
# Helper Functions
# ============================================
log_info() {
    echo -e "\033[0;34m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

log_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

# ============================================
# Backup Steps
# ============================================
echo ""
echo "============================================"
echo "   Poker Night Database Backup"
echo "============================================"
echo ""

# 1. Create backup directories
log_info "Creating backup directories..."
mkdir -p $LOCAL_BACKUP_DIR
ssh $SERVER "mkdir -p $REMOTE_BACKUP_DIR"

# 2. Dump database on server
log_info "Dumping database..."
ssh $SERVER "PGPASSWORD=$DB_PASS pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME | gzip > $REMOTE_BACKUP_DIR/$BACKUP_FILE"

log_success "Database dumped: $BACKUP_FILE"

# 3. Download backup (if --upload flag)
if [ "$UPLOAD" = true ]; then
    log_info "Downloading backup to local..."
    rsync -avz $SERVER:$REMOTE_BACKUP_DIR/$BACKUP_FILE $LOCAL_BACKUP_DIR/
    log_success "Backup downloaded to: $LOCAL_BACKUP_DIR/$BACKUP_FILE"
fi

# 4. Clean old backups (keep last 7)
log_info "Cleaning old backups..."
ssh $SERVER "cd $REMOTE_BACKUP_DIR && ls -t | tail -n +8 | xargs -r rm -f"

if [ "$UPLOAD" = true ]; then
    cd $LOCAL_BACKUP_DIR && ls -t | tail -n +8 | xargs -r rm -f
fi

log_success "Old backups cleaned (keeping last 7)"

# 5. List current backups
log_info "Current backups on server:"
ssh $SERVER "ls -lh $REMOTE_BACKUP_DIR/"

echo ""
log_success "============================================"
log_success "   Backup Complete!"
log_success "============================================"
echo ""
