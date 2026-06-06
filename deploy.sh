#!/bin/bash
# === Rolex Telecom — Deploy Script ===
# Run this on the VPS as root

set -e

echo "=== 1. Update system ==="
apt update && apt upgrade -y

echo "=== 2. Install Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo "=== 3. Install nginx & pm2 ==="
apt install -y nginx
npm install -g pm2

echo "=== 4. Clone repo ==="
cd /opt
rm -rf rolex-telecom
git clone https://github.com/manueel9999/rolex-telecom.git
cd rolex-telecom

echo "=== 5. Install dependencies ==="
npm install

echo "=== 6. Build frontend ==="
npm run build

echo "=== 7. Setup PM2 ==="
pm2 delete rolex 2>/dev/null || true
PORT=3000 pm2 start server/index.js --name rolex
pm2 save
pm2 startup

echo "=== 8. Configure Nginx ==="
cat > /etc/nginx/sites-available/rolex << 'NGINX'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/rolex /etc/nginx/sites-enabled/rolex
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo ""
echo "✅ DEPLOYED! Open: http://72.56.236.204"
echo "✅ Bridge:  http://72.56.236.204/bridge.html"
echo ""
echo "=== Done ==="
