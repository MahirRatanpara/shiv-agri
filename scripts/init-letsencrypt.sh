#!/bin/bash

# Initialize Let's Encrypt certificates for nginx
# This simplified script starts nginx with HTTP-only config, obtains certificates, then enables HTTPS

set -e

domains=(shivagri.com www.shivagri.com)
rsa_key_size=4096
email="shivagridevops@gmail.com"
staging=0 # Set to 1 if you're testing

# Check if email is set
if [ -z "$email" ]; then
  echo "Error: Please set your email address in the script"
  exit 1
fi

# Create domain arguments for certbot
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

echo "========================================="
echo "SSL Certificate Setup for ${domains[0]}"
echo "========================================="
echo ""

echo "### Step 1: Starting services (nginx in HTTP-only mode) ..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "### Step 2: Waiting for nginx to be ready ..."
sleep 5

echo ""
echo "### Step 3: Requesting Let's Encrypt certificate ..."
# Add staging flag if testing
if [ $staging != "0" ]; then
  staging_arg="--staging"
  echo "(Using staging environment for testing)"
else
  staging_arg=""
fi

docker run --rm \
  -v shiv-agri_certbot_conf:/etc/letsencrypt \
  -v shiv-agri_certbot_www:/var/www/certbot \
  certbot/certbot \
  certonly --webroot -w /var/www/certbot \
    $domain_args \
    --email $email \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    $staging_arg

echo ""
echo "========================================="
echo "✓ SSL certificates obtained successfully!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Uncomment the HTTPS server block in nginx/nginx.conf"
echo "2. Comment out the frontend proxy in the HTTP server block"
echo "3. Change HTTP location / to: return 301 https://\$host\$request_uri;"
echo "4. Rebuild and restart nginx: docker compose -f docker-compose.prod.yml restart nginx"
echo ""
echo "Your certificates are located at:"
echo "  /etc/letsencrypt/live/${domains[0]}/fullchain.pem"
echo "  /etc/letsencrypt/live/${domains[0]}/privkey.pem"
