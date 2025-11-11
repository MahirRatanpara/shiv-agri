#!/bin/bash

# Initialize Let's Encrypt certificates for nginx
# This script creates dummy certificates, starts nginx, obtains real certificates, and reloads nginx

set -e

domains=(shivagri.com www.shivagri.com)
rsa_key_size=4096
data_path="/etc/letsencrypt"
email="shivagridevops@gmail.com"

# Check if email is set
if [ -z "$email" ]; then
  echo "Error: Please set your email address in the script"
  exit 1
fi

echo "### Creating dummy certificate for ${domains[0]} ..."
mkdir -p "$data_path/live/${domains[0]}"

docker compose -f docker-compose.prod.yml run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1\
    -keyout '$data_path/live/${domains[0]}/privkey.pem' \
    -out '$data_path/live/${domains[0]}/fullchain.pem' \
    -subj '/CN=localhost'" certbot

echo "### Starting nginx ..."
docker compose -f docker-compose.prod.yml up -d nginx

echo "### Deleting dummy certificate for ${domains[0]} ..."
docker compose -f docker-compose.prod.yml run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/${domains[0]} && \
  rm -Rf /etc/letsencrypt/archive/${domains[0]} && \
  rm -Rf /etc/letsencrypt/renewal/${domains[0]}.conf" certbot

echo "### Requesting Let's Encrypt certificate for ${domains[0]} ..."
# Enable staging mode if you're testing (add --staging flag)
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

docker compose -f docker-compose.prod.yml run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $domain_args \
    --email $email \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --force-renewal" certbot

echo "### Reloading nginx ..."
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "### Done! Certificates have been obtained successfully."
