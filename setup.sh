#!/bin/bash

# ============================================
#  Script Otomatis Setup HTTPS di VPS (Nginx + Certbot)
#  Dibuat oleh Zero 🔥
# ============================================

domain=$1
webroot=$2

if [ -z "$domain" ] || [ -z "$webroot" ]; then
  echo "❌  Usage: bash setup-https.sh <domain> <webroot>"
  echo "Contoh: bash setup-https.sh evilstorm.xyz /var/www/evilstorm.xyz"
  exit 1
fi

echo "⚙️  Update & install dependensi..."
sudo apt update -y
sudo apt install nginx certbot python3-certbot-nginx -y

echo "📁  Setup direktori website..."
sudo mkdir -p $webroot
sudo chown -R $USER:$USER $webroot

echo "🧱  Membuat konfigurasi Nginx..."
config_path="/etc/nginx/sites-available/$domain"
sudo bash -c "cat > $config_path" <<EOF
server {
    listen 80;
    server_name $domain www.$domain;

    root $webroot;
    index index.html index.htm index.php;

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF

echo "🔗  Mengaktifkan konfigurasi..."
sudo ln -sf /etc/nginx/sites-available/$domain /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

echo "🔐  Mengaktifkan SSL dengan Certbot..."
sudo certbot --nginx -d $domain -d www.$domain --non-interactive --agree-tos -m admin@$domain --redirect

echo "♻️  Setup auto renew SSL..."
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

echo "✅  HTTPS berhasil diaktifkan untuk $domain"
echo "🔗  Cek di browser: https://$domain"
