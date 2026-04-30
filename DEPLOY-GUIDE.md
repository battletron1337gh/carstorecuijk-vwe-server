# VWE Webhook Server - Deploy Guide

## Stap 1: Push naar GitHub

De VWE server code staat in `/home/battletron/.openclaw/workspace/carstorecuijk-vwe-server/`

```bash
cd /home/battletron/.openclaw/workspace/carstorecuijk-vwe-server/

# Maak een nieuwe repo aan op GitHub: battletron1337gh/carstorecuijk-vwe-server
# Dan push de code:
git init
git add -A
git commit -m "Initial VWE webhook server"
git branch -M main
git remote add origin https://github.com/battletron1337gh/carstorecuijk-vwe-server.git
git push -u origin main
```

## Stap 2: Render.com Deploy

### 2.1 GitHub Personal Access Token aanmaken
1. Ga naar https://github.com/settings/tokens
2. Klik "Generate new token (classic)"
3. Geef een naam: "VWE Webhook Server"
4. Selecteer scope: `repo` (full control)
5. Genereer en kopieer de token (begint met `ghp_`)

### 2.2 Render.com Web Service aanmaken
1. Ga naar https://render.com en log in
2. Klik "New +" → "Web Service"
3. Connect je GitHub account
4. Selecteer repository: `carstorecuijk-vwe-server`
5. Configureer:
   - **Name**: `carstorecuijk-vwe`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

6. Voeg Environment Variables toe:
   ```
   GITHUB_TOKEN=ghp_je_token_hier
   GITHUB_REPO=battletron1337gh/CarStoreCuijk
   GITHUB_BRANCH=main
   ```

7. Klik "Create Web Service"

## Stap 3: Webhook URL configureren in VWE

Na deploy is de webhook URL:
```
https://carstorecuijk-vwe.onrender.com/webhook
```

Deze URL moet je invullen bij VWE in het export/beheersysteem.

## Belangrijke URLs

| Service | URL |
|---------|-----|
| Webhook (XML) | `https://carstorecuijk-vwe.onrender.com/webhook` |
| Health Check | `https://carstorecuijk-vwe.onrender.com/health` |
| Voertuigen DB | `https://carstorecuijk-vwe.onrender.com/vehicles` |

## Testen

### Health Check
```bash
curl https://carstorecuijk-vwe.onrender.com/health
```

### Test Webhook
```bash
curl -X POST https://carstorecuijk-vwe.onrender.com/webhook \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?>
<voertuig>
  <id>TEST123</id>
  <kenteken>AB123CD</kenteken>
  <merk>Volkswagen</merk>
  <model>Golf</model>
  <actie>add</actie>
</voertuig>'
```

## Troubleshooting

### Server start niet
- Check logs in Render Dashboard
- Controleer of `GITHUB_TOKEN` is ingesteld

### GitHub commit werkt niet
- Token moet `repo` rechten hebben
- Repository moet bestaan

### Webhook geeft errors
- Check of XML formaat correct is
- Bekijk logs voor specifieke errors
