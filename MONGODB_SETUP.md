# MongoDB Atlas Setup Handleiding

De webhook server is nu geconfigureerd om MongoDB Atlas te gebruiken in plaats van lokale JSON bestanden.

## Stap 1: MongoDB Atlas Account Aanmaken

1. Ga naar https://www.mongodb.com/cloud/atlas/register
2. Maak een gratis account aan (je kunt Google gebruiken voor snellere registratie)
3. Kies "Create a New Project" en noem het "CarStoreCuijk"
4. Klik "Build a Database"
5. Kies de **M0 (Gratis)** tier
6. Kies **AWS** als provider en **Frankfurt (eu-central-1)** als region (dichtstbij Nederland)
7. Klik "Create Cluster" (dit duurt een paar minuten)

## Stap 2: Database User Aanmaken

1. Klik op "Database Access" in het linker menu
2. Klik "Add New Database User"
3. Kies "Password" als authenticatie methode
4. Username: `carstoreuser`
5. Password: Genereer een sterk wachtwoord (bewaar dit!)
6. Role: Kies "Read and Write to Any Database"
7. Klik "Add User"

## Stap 3: Network Access Configureren

1. Klik op "Network Access" in het linker menu
2. Klik "Add IP Address"
3. Kies "Allow Access from Anywhere" (0.0.0.0/0)
   - Dit is nodig voor Render.com deployment
   - Alternatief: voeg specifieke Render IPs toe (maar die kunnen wijzigen)
4. Klik "Confirm"

## Stap 4: Connection String Ophalen

1. Ga terug naar "Database" → Klik "Connect" op je cluster
2. Kies "Connect your application"
3. Kopieer de connection string, het ziet er zo uit:
   ```
   mongodb+srv://carstoreuser:<password>@cluster0.xxxxx.mongodb.net/carstorecuijk?retryWrites=true&w=majority
   ```
4. Vervang `<password>` door het wachtwoord uit stap 2

## Stap 5: Environment Variable Instellen

### Lokaal Testen:
Maak een `.env` bestand in de project root:
```
MONGODB_URI=mongodb+srv://carstoreuser:JOUW_WACHTWOORD@cluster0.xxxxx.mongodb.net/carstorecuijk?retryWrites=true&w=majority
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

### Render.com Deployment:
1. Ga naar je Render dashboard
2. Selecteer de CarStoreCuijk service
3. Ga naar "Environment" tab
4. Voeg toe:
   - Key: `MONGODB_URI`
   - Value: De connection string uit stap 4
5. Klik "Save Changes"

## Stap 6: Testen

Start de server lokaal:
```bash
cd /home/battletron/.openclaw/workspace/carstorecuijk-vwe-server
npm start
```

Test de database connectie:
```bash
curl http://localhost:3000/vehicles
```

Je zou een lege array moeten zien: `{"vehicles":[]}`

## Wat is er veranderd?

- **Database**: Van lokale JSON file naar MongoDB Atlas
- **Data persistentie**: Data blijft behouden bij server herstarts
- **Schaling**: Ondersteunt meerdere server instances
- **Backup**: MongoDB Atlas heeft automatische backups

## Troubleshooting

**Fout: "MongoServerSelectionError"**
- Controleer of je IP whitelist correct is (0.0.0.0/0 voor Render)
- Controleer of het wachtwoord correct is in de connection string

**Fout: "Authentication failed"**
- Controleer of het wachtwoord correct is URL-encoded (bijv. @ wordt %40)
- Controleer of de database user correct is aangemaakt

**Fout: "Cannot find module 'mongodb'"**
- Run `npm install` opnieuw

## Belangrijke Notities

- De gratis M0 tier heeft een limiet van 512MB opslag
- Voor productie gebruik, overweeg een betaald plan
- De connection string bevat gevoelige data - deel deze nooit publiek
