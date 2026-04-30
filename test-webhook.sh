#!/bin/bash

# Test script voor VWE Webhook Server
# Gebruik: ./test-webhook.sh [URL]

WEBHOOK_URL="${1:-http://localhost:3000/webhook}"

echo "Testing VWE Webhook Server"
echo "URL: $WEBHOOK_URL"
echo "=========================="

# Test 1: Health check
echo -e "\n1. Health check:"
curl -s "$WEBHOOK_URL" | head -20

# Test 2: Send test XML
echo -e "\n\n2. Sending test XML webhook:"
curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0" encoding="UTF-8"?>
<voertuig>
  <id>TEST123</id>
  <kenteken>AB123CD</kenteken>
  <merk>Volkswagen</merk>
  <model>Golf</model>
  <bouwjaar>2020</bouwjaar>
  <prijs>24995</prijs>
  <kmStand>45000</kmStand>
  <brandstof>Benzine</brandstof>
  <transmissie>Handgeschakeld</transmissie>
  <kleur>Zwart</kleur>
  <actie>add</actie>
</voertuig>' | head -30

# Test 3: Check vehicles
echo -e "\n\n3. Checking vehicles database:"
curl -s "${WEBHOOK_URL%/webhook}/vehicles" | head -40

echo -e "\n\n=========================="
echo "Tests completed!"
