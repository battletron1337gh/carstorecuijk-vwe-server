# Deploy Instructies - Car Store Cuijk VWE Server

## Optie 1: Render.com (Aanbevolen - Gratis)

### Stap 1: GitHub Repository
De code staat in:
```
/home/battletron/.openclaw/workspace/carstorecuijk-vwe-server/
```

Je moet dit pushen naar een GitHub repository. Opties:
- **A**: Gebruik bestaande repo `battletron1337gh/CarStoreCuijk`
- **B**: Maak nieuwe repo `carstorecuijk-vwe-server`

### Stap 2: GitHub Personal Access Token

1. Ga naar https://github.com/settings/tokens
2. Klik "Generate new token (classic)"
3. Geef een naam: "VWE Webhook Server"
4. Selecteer scope: `repo` (full control)
5. Genereer en kopieer de token

### Stap 3: Render.com Setup

1. Ga naar https://render.com en log in
2. Klik "New +" → "Web Service"
3. Connect je GitHub account
4. Selecteer de repository
5. Configureer:
   - **Name**: `carstorecuijk-vwe`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

6. Voeg Environment Variables toe:
   ```
   GITHUB_TOKEN=ghp_xxxxxxxxxxxx
   GITHUB_REPO=battletron1337gh/CarStoreCuijk
   GITHUB_BRANCH=main
   ```

7. Klik "Create Web Service"

### Stap 4: Webhook URL

Na deploy, de webhook URL is:
```
https://carstorecuijk-vwe.onrender.com/webhook
```

Deze URL moet je doorgeven aan VWE.

---

## Optie 2: Alternatieve Hosting

De server werkt ook op:
- Railway.app
- Fly.io
- Heroku
- Elke VPS met Node.js

---

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

---

## Belangrijke URLs

| Service | URL |
|---------|-----|
| Webhook (XML) | `https://carstorecuijk-vwe.onrender.com/webhook` |
| Health Check | `https://carstorecuijk-vwe.onrender.com/health` |
| Voertuigen DB | `https://carstorecuijk-vwe.onrender.com/vehicles` |

---

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
