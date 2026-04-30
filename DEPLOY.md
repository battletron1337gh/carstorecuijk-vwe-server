# Deploy Instructies - Car Store Cuijk VWE Server

## Overzicht

Deze server ontvangt VWE webhook calls en:
1. Slaat voertuigdata op in een database
2. Commit wijzigingen naar GitHub
3. **Deployt automatisch naar Hostinger via SSH**

## Optie 1: Render.com (Aanbevolen - Gratis)

### Stap 1: SSH Key Voorbereiden

De SSH key moet als base64 encoded string in een environment variable:

```bash
# Op je lokale machine (Linux/Mac):
base64 -i ~/.ssh/carstorecuijk_deploy~ -o /tmp/key_base64.txt

# Of direct output:
cat ~/.ssh/carstorecuijk_deploy~ | base64
```

Kopieer de base64 string voor gebruik in Render.com.

### Stap 2: GitHub Repository

De code staat al in:
```
/home/battletron/.openclaw/workspace/carstorecuijk-vwe-server/
```

Push naar GitHub:
```bash
cd /home/battletron/.openclaw/workspace/carstorecuijk-vwe-server/
git add -A
git commit -m "Add automatic Hostinger deploy via SSH"
git push origin main
```

### Stap 3: Render.com Environment Variables

In het Render.com dashboard, voeg deze environment variables toe:

```
# GitHub Config
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_REPO=battletron1337gh/CarStoreCuijk
GITHUB_BRANCH=main

# Hostinger SSH Config (BELANGRIJK: SSH key moet base64 encoded zijn!)
HOSTINGER_SSH_KEY=LS0tLS1CRUdJTiBPUEVOU1NIIFBSSVZBVEUgS0VZLS0tLS0KYjNCbGJuTnphQzFyWlhrdGRqRUFBQUFBQkc1dmJtVUFBQUFFYm05dVpRQUFBQUFBQUFBQkFBQUFNd0FBQUF0emMyZ3RaVwpReU5UVXhPUUFBQUNDdS9OTmlJQW15VnJRalJBVGYwQ2Z2SkZqc2ZPOXZ2elRJSk9rYkxYNWhlZ0FBQUtCM1ZIaXBkMVI0CnFRQUFBQXR6YzJndFpXUXlOVFV4T1FBQUFDQ3UvTk5pSUFteVZyUWpSQVRmMENmdkpGanNmTzl2dnpUSUpPa2JMWDVoZWcKQUFBRUM0M2dvSFByRFVFSXNHbmlUM2tjdFdhR0FERDB0OUQwMkdNVCtQWjhJOUlhNzgwMklnQ2JKV3RDTkVCTi9RSis4awpXT3g4NzIrL05NZ2s2UnN0Zm1GNkFBQUFGbTl3Wlc1amJHRjNRR05oY25OMGIzSmxZM1ZwYW1zQkFnTUVCUVlICi0tLS0tRU5EIE9QRU5TU0ggUFJJVkFURSBLRVktLS0tLQo=
HOSTINGER_HOST=194.36.187.37
HOSTINGER_PORT=65002
HOSTINGER_USER=u258982067
HOSTINGER_REPO_DIR=/home/u258982067/carstorecuijk-git
HOSTINGER_REMOTE_DIR=/home/u258982067/domains/carstorecuijk.nl/public_html
```

### Stap 4: Webhook URL Configureren in VWE

Na deploy is de webhook URL:
```
https://carstorecuijk-vwe.onrender.com/webhook
```

Deze URL moet je invullen bij VWE in het export/beheersysteem.

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

### Manual Deploy Trigger
```bash
curl -X POST https://carstorecuijk-vwe.onrender.com/deploy
```

---

## Belangrijke URLs

| Service | URL |
|---------|-----|
| Webhook (XML) | `https://carstorecuijk-vwe.onrender.com/webhook` |
| Health Check | `https://carstorecuijk-vwe.onrender.com/health` |
| Voertuigen DB | `https://carstorecuijk-vwe.onrender.com/vehicles` |
| Manual Deploy | `https://carstorecuijk-vwe.onrender.com/deploy` |

---

## Troubleshooting

### Server start niet
- Check logs in Render Dashboard
- Controleer of alle environment variables zijn ingesteld
- Controleer of `HOSTINGER_SSH_KEY` correct is base64 encoded

### GitHub commit werkt niet
- Token moet `repo` rechten hebben
- Repository moet bestaan

### Hostinger deploy werkt niet
- Controleer of de SSH key correct is (base64 encoded)
- Controleer of het pad `HOSTINGER_REPO_DIR` bestaat op de server
- Controleer of git repository is gecloned op Hostinger
- Test SSH verbinding handmatig: `ssh -p 65002 -i ~/.ssh/carstorecuijk_deploy~ u258982067@194.36.187.37`

### Webhook geeft errors
- Check of XML formaat correct is
- Bekijk logs voor specifieke errors

---

## Hoe het werkt

```
VWE stuurt XML
       ↓
Render.com Webhook Server
       ↓
├── Parse XML
├── Sla op in database
├── Commit naar GitHub
└── SSH naar Hostinger
        ↓
    git pull
    npm install
    npm run build
    rsync naar public_html
        ↓
   Website geüpdatet!
```
