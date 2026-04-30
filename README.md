# VWE Webhook Server voor Car Store Cuijk

Deze server ontvangt voertuig updates van VWE (Voertuig Wissel Eenheid) via webhooks, slaat ze op in een JSON database, downloadt foto's, en commit de changes naar GitHub om een deploy naar Hostinger te triggeren.

## Wat doet deze server?

1. **Ontvangt POST requests** van VWE op `/webhook`
2. **Parseert XML** naar JSON (ondersteunt add/change/delete acties)
3. **Slaat voertuigen op** in een lokale JSON database
4. **Downloadt foto's** van de voertuigen
5. **Commit en push** naar GitHub (triggert deploy naar Hostinger)

## Deploy op Render.com

### 1. Maak een nieuwe Web Service op Render

1. Ga naar [render.com](https://render.com) en log in
2. Klik "New +" → "Web Service"
3. Kies "Build and deploy from a Git repository"
4. Connect je GitHub account en selecteer de repo

### 2. Configureer de service

| Setting | Waarde |
|---------|--------|
| **Name** | `carstorecuijk-vwe` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Plan** | `Free` |

### 3. Environment Variables

Voeg deze environment variables toe in Render Dashboard → Environment:

```
GITHUB_TOKEN=ghp_je_github_token_hier
GITHUB_REPO=battletron1337gh/CarStoreCuijk
GITHUB_BRANCH=main
```

**Belangrijk:** Genereer een GitHub Personal Access Token met `repo` rechten:
1. Ga naar GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Genereer nieuwe token met `repo` scope
3. Kopieer de token naar Render environment variables

### 4. Deploy!

Klik "Create Web Service" en wacht tot de deploy klaar is.

## Webhook URL

Na deploy is de webhook URL:

```
https://carstorecuijk-vwe.onrender.com/webhook
```

Deze URL moet je doorgeven aan VWE om te configureren in hun systeem.

## API Endpoints

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/` | GET | Health check + info |
| `/health` | GET | Simpele health check |
| `/webhook` | POST | Main VWE webhook (XML) |
| `/webhook/json` | POST | Test webhook (JSON) |
| `/vehicles` | GET | Bekijk alle voertuigen (debug) |

## Voorbeeld XML Payload

```xml
<?xml version="1.0" encoding="UTF-8"?>
<voertuig>
  <id>12345</id>
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
  <fotos>
    <foto>https://vwe.nl/foto1.jpg</foto>
    <foto>https://vwe.nl/foto2.jpg</foto>
  </fotos>
</voertuig>
```

## Lokale Development

```bash
# Install dependencies
npm install

# Kopieer environment variables
cp .env.example .env
# Edit .env met je eigen waarden

# Start development server
npm run dev
```

## Environment Variables

| Variable | Verplicht | Default | Beschrijving |
|----------|-----------|---------|--------------|
| `GITHUB_TOKEN` | Ja | - | GitHub Personal Access Token |
| `GITHUB_REPO` | Nee | `battletron1337gh/CarStoreCuijk` | GitHub repository |
| `GITHUB_BRANCH` | Nee | `main` | Git branch |
| `PORT` | Nee | `3000` | Server poort |
| `DATA_DIR` | Nee | `./data` | Lokale data directory |
| `REPO_DIR` | Nee | `./repo` | Git clone directory |
| `WEBHOOK_SECRET` | Nee | - | Optionele webhook secret |

## File Structuur

```
carstorecuijk-vwe-server/
├── server.js           # Main server code
├── package.json        # Dependencies
├── .env.example        # Voorbeeld environment variables
├── README.md           # Deze file
├── .gitignore          # Git ignore rules
└── data/               # Lokale database (gitignored)
    ├── vehicles.json   # Voertuig database
    └── photos/         # Gedownloade foto's
```

## Troubleshooting

### Webhook werkt niet?
- Check de logs in Render Dashboard
- Test met `/health` endpoint
- Controleer of `GITHUB_TOKEN` correct is ingesteld

### GitHub commit werkt niet?
- Controleer of de token `repo` rechten heeft
- Check of de repository bestaat
- Bekijk logs voor specifieke errors

### Foto's worden niet gedownload?
- Foto download is non-blocking (fouten loggen maar falen niet)
- Controleer of URLs bereikbaar zijn vanaf Render
- Check logs voor download errors

## Support

Bij vragen of problemen, check de logs in Render Dashboard of neem contact op met de developer.
