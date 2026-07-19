#!/bin/bash
# Poker Night Server Initialization Script
# 用法: ./setup-server.sh

set -e

# ============================================
# Configuration
# ============================================
SERVER="root@43.164.130.145"
REMOTE_DIR="/opt/poker-night"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
# Setup Steps
# ============================================
echo ""
echo "============================================"
echo "   Poker Night Server Setup"
echo "============================================"
echo ""

# 1. Update System
log_info "Updating system packages..."
ssh $SERVER "apt-get update && apt-get upgrade -y"

# 2. Install Node.js 20
log_info "Installing Node.js 20..."
ssh $SERVER << 'EOF'
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi
    node --version
    npm --version
EOF

log_success "Node.js installed"

# 3. Install PM2
log_info "Installing PM2..."
ssh $Server << 'EOF'
    if ! command -v pm2 &> /dev/null; then
        npm install -g pm2
        pm2 startup
    fi
    pm2 --version
EOF

log_success "PM2 installed"

# 4. Install PostgreSQL
log_info "Installing PostgreSQL..."
ssh $SERVER << 'EOF'
    if ! command -v psql &> /dev/null; then
        apt-get install -y postgresql postgresql-contrib
        systemctl start postgresql
        systemctl enable postgresql
    fi
    psql --version
EOF

log_success "PostgreSQL installed"

# 5. Configure PostgreSQL
log_info "Configuring PostgreSQL..."
ssh $SERVER << 'EOF'
    sudo -u postgres psql << 'SQL'
        CREATE USER poker WITH PASSWORD 'poker123';
        CREATE DATABASE poker_night OWNER poker;
        GRANT ALL PRIVILEGES ON DATABASE poker_night TO poker;
SQL
EOF

log_success "PostgreSQL configured"

# 6. Install Nginx
log_info "Installing Nginx..."
ssh $Server << 'EOF'
    if ! command -v nginx &> /dev/null; then
        apt-get install -y nginx
        systemctl start nginx
        systemctl enable nginx
    fi
    nginx -v
EOF

log_success "Nginx installed"

# 7. Create Project Directory
log_info "Creating project directory..."
ssh $SERVER "mkdir -p $REMOTE_DIR/{server,public/apk,backups}"
ssh $Server "mkdir -p /var/log/pm2"

log_success "Directories created"

# 8. Configure Nginx
log_info "Configuring Nginx..."
rsync -avz ./nginx/poker-night.conf $SERVER:/etc/nginx/sites-available/
ssh $Server << 'EOF'
    ln -sf /etc/nginx/sites-available/poker-night.conf /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
EOF

log_success "Nginx configured"

# 9. Configure Firewall
log_info "Configuring firewall..."
ssh $Server << 'EOF'
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
EOF

log_success "Firewall configured"

# 10. Install Monitoring Tools
log_info "Installing monitoring tools..."
ssh $Server "apt-get install -y htop iotop nethogs"

log_success "Monitoring tools installed"

echo ""
log_success "============================================"
log_success "   Server Setup Complete!"
log_success "============================================"
echo ""
echo "Next steps:"
echo "  1. Run: ./deploy.sh"
echo "  2. Setup SSL: certbot --nginx -d your-domain.com"
echo ""
