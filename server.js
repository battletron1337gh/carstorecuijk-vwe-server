/**
 * VWE Webhook Server voor Car Store Cuijk
 * 
 * Ontvangt voertuig data van VWE en:
 * 1. Slaat op in lokale database
 * 2. Commit naar GitHub
 * 
 * De deploy naar Hostinger gebeurt automatisch via GitHub Actions
 * zodra er een commit wordt gedaan.
 * 
 * Deploy: Render.com (gratis tier)
 */

const express = require('express');
const xml2js = require('xml2js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { Octokit } = require('@octokit/rest');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuratie
const CONFIG = {
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_REPO: process.env.GITHUB_REPO || 'battletron1337gh/CarStoreCuijk',
  GITHUB_BRANCH: process.env.GITHUB_BRANCH || 'main',
  DATA_DIR: process.env.DATA_DIR || './data',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || null
};

// Initialiseer Octokit
const octokit = CONFIG.GITHUB_TOKEN ? new Octokit({ auth: CONFIG.GITHUB_TOKEN }) : null;

// Middleware
app.use(express.raw({ type: 'application/xml', limit: '10mb' }));
app.use(express.text({ type: 'text/xml', limit: '10mb' }));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'VWE Webhook Server',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    features: {
      github: !!octokit,
      autoDeploy: 'Via GitHub Actions'
    }
  });
});

// Health check voor monitoring
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    github: !!octokit,
    autoDeploy: 'GitHub Actions → Hostinger'
  });
});

// XML Parser
const xmlParser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });

/**
 * Parse VWE XML naar JSON object
 */
async function parseVWEXml(xmlData) {
  try {
    const result = await xmlParser.parseStringPromise(xmlData);
    return result;
  } catch (error) {
    console.error('XML Parse Error:', error.message);
    throw new Error('Invalid XML format');
  }
}

/**
 * Haal voertuig data uit VWE XML
 */
function extractVehicleData(parsedXml) {
  const voertuig = parsedXml.voertuig || parsedXml.Voertuig || parsedXml.vehicle || parsedXml.Vehicle;
  
  if (!voertuig) {
    const root = Object.values(parsedXml)[0];
    if (root && typeof root === 'object') {
      return normalizeVehicleData(root);
    }
    throw new Error('Geen voertuig data gevonden in XML');
  }
  
  return normalizeVehicleData(voertuig);
}

/**
 * Normaliseer voertuig data naar consistent formaat
 */
function normalizeVehicleData(data) {
  return {
    id: data.id || data.ID || data.voertuigId || data.kenteken || `vehicle_${Date.now()}`,
    kenteken: data.kenteken || data.licensePlate || data.license_plate || '',
    merk: data.merk || data.make || data.Merk || '',
    model: data.model || data.Model || data.type || data.Type || '',
    bouwjaar: data.bouwjaar || data.year || data.Bouwjaar || data.productiejaar || '',
    prijs: data.prijs || data.price || data.Prijs || data.verkoopprijs || '',
    kmStand: data.kmStand || data.kilometerstand || data.mileage || data.KmStand || '',
    brandstof: data.brandstof || data.fuel || data.Brandstof || '',
    transmissie: data.transmissie || data.transmission || data.Transmissie || '',
    kleur: data.kleur || data.color || data.Kleur || '',
    fotoUrls: extractPhotoUrls(data),
    actie: data.actie || data.action || data.Actie || 'add',
    timestamp: new Date().toISOString(),
    raw: data
  };
}

/**
 * Extract foto URLs uit voertuig data
 */
function extractPhotoUrls(data) {
  const urls = [];
  const fotoFields = ['foto', 'fotos', 'photo', 'photos', 'afbeelding', 'afbeeldingen', 'image', 'images'];
  
  for (const field of fotoFields) {
    if (data[field]) {
      const fotos = Array.isArray(data[field]) ? data[field] : [data[field]];
      fotos.forEach(foto => {
        if (typeof foto === 'string' && foto.match(/^https?:\/\//)) {
          urls.push(foto);
        } else if (foto.url || foto.Url || foto.URL) {
          urls.push(foto.url || foto.Url || foto.URL);
        }
      });
    }
  }
  
  return urls;
}

/**
 * Sla voertuig op in JSON database
 */
async function saveVehicle(vehicleData) {
  const dbPath = path.join(CONFIG.DATA_DIR, 'vehicles.json');
  
  try {
    await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
    
    let db = { vehicles: [] };
    try {
      const existing = await fs.readFile(dbPath, 'utf8');
      db = JSON.parse(existing);
    } catch (e) {
      // Bestand bestaat nog niet
    }
    
    const existingIndex = db.vehicles.findIndex(v => v.id === vehicleData.id || v.kenteken === vehicleData.kenteken);
    
    if (existingIndex >= 0) {
      if (vehicleData.actie === 'delete') {
        db.vehicles.splice(existingIndex, 1);
        console.log(`Voertuig verwijderd: ${vehicleData.id}`);
      } else {
        db.vehicles[existingIndex] = { ...db.vehicles[existingIndex], ...vehicleData };
        console.log(`Voertuig geupdate: ${vehicleData.id}`);
      }
    } else if (vehicleData.actie !== 'delete') {
      db.vehicles.push(vehicleData);
      console.log(`Nieuw voertuig toegevoegd: ${vehicleData.id}`);
    }
    
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
    return db;
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  }
}

/**
 * Download foto's naar lokale opslag
 */
async function downloadPhotos(vehicleData) {
  if (!vehicleData.fotoUrls || vehicleData.fotoUrls.length === 0) {
    return [];
  }
  
  const photoDir = path.join(CONFIG.DATA_DIR, 'photos', vehicleData.id);
  await fs.mkdir(photoDir, { recursive: true });
  
  const downloadedPhotos = [];
  
  for (let i = 0; i < vehicleData.fotoUrls.length; i++) {
    const url = vehicleData.fotoUrls[i];
    const ext = path.extname(new URL(url).pathname) || '.jpg';
    const filename = `photo_${i + 1}${ext}`;
    const filepath = path.join(photoDir, filename);
    
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      await fs.writeFile(filepath, response.data);
      downloadedPhotos.push({ originalUrl: url, localPath: filepath, filename });
      console.log(`Foto gedownload: ${filename}`);
    } catch (error) {
      console.error(`Foto download mislukt: ${url}`, error.message);
    }
  }
  
  return downloadedPhotos;
}

/**
 * Commit en push naar GitHub via REST API (Octokit)
 * Dit triggert automatisch GitHub Actions die deployed naar Hostinger
 */
async function commitToGitHub(vehicleData) {
  if (!CONFIG.GITHUB_TOKEN || !octokit) {
    console.warn('Geen GITHUB_TOKEN geconfigureerd, sla over');
    return { skipped: true, reason: 'No GitHub token' };
  }

  const [owner, repo] = CONFIG.GITHUB_REPO.split('/');
  const filePath = 'data/vehicles.json';
  const commitMessage = `VWE Update: ${vehicleData.actie} ${vehicleData.merk} ${vehicleData.model} (${vehicleData.kenteken || vehicleData.id})`;

  try {
    const dbSource = path.join(CONFIG.DATA_DIR, 'vehicles.json');
    let content;
    try {
      content = await fs.readFile(dbSource, 'utf8');
    } catch (e) {
      return { skipped: true, reason: 'No database file' };
    }

    const contentBase64 = Buffer.from(content).toString('base64');

    let sha = null;
    try {
      const { data: existingFile } = await octokit.repos.getContent({
        owner, repo, path: filePath, ref: CONFIG.GITHUB_BRANCH
      });
      sha = existingFile.sha;
    } catch (e) {
      console.log('File bestaat nog niet, wordt aangemaakt');
    }

    const { data: commitData } = await octokit.repos.createOrUpdateFileContents({
      owner, repo, path: filePath, message: commitMessage,
      content: contentBase64, branch: CONFIG.GITHUB_BRANCH, sha: sha || undefined
    });

    console.log('Changes gecommit naar GitHub:', commitData.commit.sha);
    console.log('GitHub Actions zal nu automatisch deployen naar Hostinger...');
    
    return { 
      success: true, 
      commitMessage, 
      commitSha: commitData.commit.sha, 
      filePath,
      deployMethod: 'GitHub Actions → Hostinger'
    };

  } catch (error) {
    console.error('GitHub commit error:', error.message);
    return { success: false, error: error.message };
  }
}

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('Webhook ontvangen');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body length:', req.body ? req.body.length : 0);
    
    const xmlData = req.body;
    if (!xmlData || xmlData.length === 0) {
      return res.status(400).json({ error: 'Lege body ontvangen' });
    }
    
    // Parse XML
    const parsedXml = await parseVWEXml(xmlData);
    console.log('XML parsed successfully');
    
    // Extract voertuig data
    const vehicleData = extractVehicleData(parsedXml);
    console.log('Voertuig data extracted:', vehicleData.id, vehicleData.merk, vehicleData.model);
    
    // Sla op in database
    await saveVehicle(vehicleData);
    
    // Download foto's (async, non-blocking)
    downloadPhotos(vehicleData).catch(err => {
      console.error('Foto download error (non-blocking):', err.message);
    });
    
    // Commit naar GitHub (triggert automatisch deploy naar Hostinger)
    const gitResult = await commitToGitHub(vehicleData);
    
    const duration = Date.now() - startTime;
    console.log(`Webhook verwerkt in ${duration}ms`);
    console.log('GitHub Actions zal nu automatisch deployen naar Hostinger...');
    
    // Response - VWE verwacht simpel "1" voor succes
    res.status(200).send('1');
    
  } catch (error) {
    console.error('Webhook error:', error);
    // VWE verwacht "1" voor succes, ook bij errors (anders blijft VWE het herhalen)
    res.status(200).send('1');
  }
});

// Test endpoint voor JSON data
app.post('/webhook/json', async (req, res) => {
  try {
    const vehicleData = normalizeVehicleData(req.body);
    await saveVehicle(vehicleData);
    
    const gitResult = await commitToGitHub(vehicleData);
    
    res.json({
      success: true,
      vehicle: vehicleData,
      gitResult
    });
  } catch (error) {
    console.error('JSON webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// View database endpoint
app.get('/vehicles', async (req, res) => {
  try {
    const dbPath = path.join(CONFIG.DATA_DIR, 'vehicles.json');
    const data = await fs.readFile(dbPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(404).json({ error: 'Database niet gevonden', vehicles: [] });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('VWE Webhook Server voor Car Store Cuijk');
  console.log('='.repeat(60));
  console.log(`Server draait op poort ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('Workflow:');
  console.log('  1. VWE stuurt XML webhook');
  console.log('  2. Server slaat op in database');
  console.log('  3. Server commit naar GitHub');
  console.log('  4. GitHub Actions deployed naar Hostinger ✨');
  console.log('');
  console.log('Configuratie:');
  console.log(`  GitHub Repo: ${CONFIG.GITHUB_REPO}`);
  console.log(`  GitHub Branch: ${CONFIG.GITHUB_BRANCH}`);
  console.log(`  GitHub Token: ${CONFIG.GITHUB_TOKEN ? '✓ Geconfigureerd' : '✗ Niet geconfigureerd'}`);
  console.log('='.repeat(60));
});

module.exports = app;
