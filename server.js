/**
 * VWE Webhook Server voor Car Store Cuijk
 * 
 * Ontvangt voertuig data van VWE en:
 * 1. Slaat op in lokale database
 * 2. Download foto's naar public/vwe-fotos/[kenteken]/
 * 3. Commit JSON + foto's naar GitHub
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
const hostinger = require('./src/hostinger');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuratie
const CONFIG = {
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_REPO: process.env.GITHUB_REPO || 'battletron1337gh/CarStoreCuijk',
  GITHUB_BRANCH: process.env.GITHUB_BRANCH || 'master',
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
    version: '3.1.0',
    timestamp: new Date().toISOString(),
    features: {
      github: !!octokit,
      hostinger: hostinger.isConfigured(),
      autoDeploy: hostinger.isConfigured() ? 'Direct SSH → Hostinger' : 'Via GitHub Actions',
      photoDownload: true
    }
  });
});

// Health check voor monitoring
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    github: !!octokit,
    hostinger: hostinger.isConfigured(),
    autoDeploy: hostinger.isConfigured() ? 'Direct SSH → Hostinger' : 'GitHub Actions → Hostinger'
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
 * Ondersteunt VWE's specifieke XML structuur
 */
function normalizeVehicleData(data) {
  // Extract prijs uit VWE's geneste structuur: verkoopprijs_particulier.prijzen.prijs.bedrag
  let prijs = '';
  if (data.verkoopprijs_particulier && data.verkoopprijs_particulier.prijzen && data.verkoopprijs_particulier.prijzen.prijs) {
    const prijsData = data.verkoopprijs_particulier.prijzen.prijs;
    prijs = prijsData.bedrag || prijsData.Bedrag || '';
  }
  // Fallback naar andere prijs velden
  if (!prijs) {
    prijs = data.prijs || data.price || data.Prijs || data.verkoopprijs || '';
  }

  // Extract KM stand uit VWE's tellerstand._ structuur
  let kmStand = '';
  if (data.tellerstand && data.tellerstand._) {
    kmStand = data.tellerstand._;
  } else if (data.tellerstand && typeof data.tellerstand === 'string') {
    kmStand = data.tellerstand;
  }
  // Fallback naar andere km velden
  if (!kmStand) {
    kmStand = data.kmStand || data.kilometerstand || data.mileage || data.KmStand || '';
  }

  return {
    id: data.id || data.ID || data.voertuigId || data.kenteken || `vehicle_${Date.now()}`,
    kenteken: data.kenteken || data.licensePlate || data.license_plate || '',
    merk: data.merk || data.make || data.Merk || '',
    model: data.model || data.Model || data.type || data.Type || '',
    bouwjaar: data.bouwjaar || data.year || data.Bouwjaar || data.productiejaar || '',
    prijs: prijs,
    kmStand: kmStand,
    brandstof: data.brandstof || data.fuel || data.Brandstof || '',
    transmissie: data.transmissie || data.transmission || data.Transmissie || '',
    kleur: data.basiskleur || data.kleur || data.color || data.Kleur || '',
    fotoUrls: extractPhotoUrls(data),
    actie: data.actie || data.action || data.Actie || 'add',
    timestamp: new Date().toISOString(),
    raw: data
  };
}

/**
 * Extract foto URLs uit voertuig data
 * Ondersteunt zowel directe URLs als VWE's afbeeldingen.afbeelding structuur
 */
function extractPhotoUrls(data) {
  const urls = [];
  const fotoFields = ['foto', 'fotos', 'photo', 'photos', 'afbeelding', 'afbeeldingen', 'image', 'images'];
  
  // Check voor VWE's specifieke afbeeldingen structuur
  if (data.afbeeldingen && data.afbeeldingen.afbeelding) {
    const afbeeldingen = Array.isArray(data.afbeeldingen.afbeelding) 
      ? data.afbeeldingen.afbeelding 
      : [data.afbeeldingen.afbeelding];
    
    afbeeldingen.forEach(foto => {
      if (typeof foto === 'string' && foto.match(/^https?:\/\//)) {
        urls.push(foto);
      } else if (foto.url || foto.Url || foto.URL) {
        urls.push(foto.url || foto.Url || foto.URL);
      } else if (foto._) {
        // Soms zit de URL in een text node
        const url = foto._.trim();
        if (url.match(/^https?:\/\//)) {
          urls.push(url);
        }
      }
    });
  }
  
  // Fallback naar andere velden
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
 * Slaat op in public/vwe-fotos/[kenteken]/ structuur
 */
async function downloadPhotos(vehicleData) {
  // Haal foto URLs uit raw data (VWE structuur)
  const fotoUrls = [];
  
  if (vehicleData.raw && vehicleData.raw.afbeeldingen && vehicleData.raw.afbeeldingen.afbeelding) {
    const afbeeldingen = Array.isArray(vehicleData.raw.afbeeldingen.afbeelding) 
      ? vehicleData.raw.afbeeldingen.afbeelding 
      : [vehicleData.raw.afbeeldingen.afbeelding];
    
    afbeeldingen.forEach(foto => {
      if (typeof foto === 'string' && foto.match(/^https?:\/\//)) {
        fotoUrls.push(foto);
      } else if (foto.url || foto.Url || foto.URL) {
        fotoUrls.push(foto.url || foto.Url || foto.URL);
      } else if (foto._) {
        const url = foto._.trim();
        if (url.match(/^https?:\/\//)) {
          fotoUrls.push(url);
        }
      }
    });
  }
  
  // Fallback naar vehicleData.fotoUrls
  if (fotoUrls.length === 0 && vehicleData.fotoUrls && vehicleData.fotoUrls.length > 0) {
    fotoUrls.push(...vehicleData.fotoUrls);
  }
  
  if (fotoUrls.length === 0) {
    console.log('Geen foto URLs gevonden voor voertuig:', vehicleData.kenteken || vehicleData.id);
    return [];
  }
  
  // Gebruik kenteken als map naam (of ID als fallback)
  const folderName = vehicleData.kenteken || vehicleData.id;
  const photoDir = path.join('public', 'vwe-fotos', folderName);
  
  try {
    await fs.mkdir(photoDir, { recursive: true });
  } catch (error) {
    console.error('Fout bij maken van foto directory:', error.message);
    return [];
  }
  
  const downloadedPhotos = [];
  
  for (let i = 0; i < fotoUrls.length; i++) {
    const url = fotoUrls[i];
    const ext = path.extname(new URL(url).pathname) || '.jpg';
    const filename = `${i + 1}${ext}`;
    const filepath = path.join(photoDir, filename);
    
    try {
      const response = await axios.get(url, { 
        responseType: 'arraybuffer', 
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      await fs.writeFile(filepath, response.data);
      downloadedPhotos.push({ 
        originalUrl: url, 
        localPath: filepath, 
        filename,
        relativePath: path.join('public', 'vwe-fotos', folderName, filename)
      });
      console.log(`Foto gedownload: ${filepath}`);
    } catch (error) {
      console.error(`Foto download mislukt: ${url}`, error.message);
    }
  }
  
  console.log(`${downloadedPhotos.length}/${fotoUrls.length} foto's gedownload voor ${folderName}`);
  return downloadedPhotos;
}

/**
 * Commit en push naar GitHub via REST API (Octokit)
 * Dit triggert automatisch GitHub Actions die deployed naar Hostinger
 * Commit nu ook de gedownloade foto's
 */
async function commitToGitHub(vehicleData, downloadedPhotos = []) {
  if (!CONFIG.GITHUB_TOKEN || !octokit) {
    console.warn('Geen GITHUB_TOKEN geconfigureerd, sla over');
    return { skipped: true, reason: 'No GitHub token' };
  }

  const [owner, repo] = CONFIG.GITHUB_REPO.split('/');
  const commitMessage = `VWE Update: ${vehicleData.actie} ${vehicleData.merk} ${vehicleData.model} (${vehicleData.kenteken || vehicleData.id})`;

  try {
    // Haal huidige commit SHA op voor de branch
    const { data: refData } = await octokit.git.getRef({
      owner, repo, ref: `heads/${CONFIG.GITHUB_BRANCH}`
    });
    const currentCommitSha = refData.object.sha;

    // Haal huidige tree op
    const { data: commitData } = await octokit.git.getCommit({
      owner, repo, commit_sha: currentCommitSha
    });
    const currentTreeSha = commitData.tree.sha;

    // Bereid bestanden voor
    const files = [];

    // 1. Voertuigen database
    const dbSource = path.join(CONFIG.DATA_DIR, 'vehicles.json');
    try {
      const dbContent = await fs.readFile(dbSource, 'utf8');
      files.push({
        path: 'data/vehicles.json',
        content: dbContent
      });
    } catch (e) {
      console.log('Geen database file gevonden');
    }

    // 2. Gedownloade foto's
    for (const photo of downloadedPhotos) {
      try {
        const photoContent = await fs.readFile(photo.localPath);
        files.push({
          path: photo.relativePath,
          content: photoContent.toString('base64'),
          encoding: 'base64'
        });
      } catch (e) {
        console.error(`Fout bij lezen foto voor commit: ${photo.localPath}`, e.message);
      }
    }

    if (files.length === 0) {
      return { skipped: true, reason: 'Geen bestanden om te committen' };
    }

    // Maak blobs voor alle bestanden
    const treeItems = [];
    for (const file of files) {
      const { data: blobData } = await octokit.git.createBlob({
        owner, repo, 
        content: file.content, 
        encoding: file.encoding || 'utf-8'
      });
      
      treeItems.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha
      });
    }

    // Maak nieuwe tree
    const { data: newTree } = await octokit.git.createTree({
      owner, repo, 
      base_tree: currentTreeSha, 
      tree: treeItems
    });

    // Maak nieuwe commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner, repo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [currentCommitSha]
    });

    // Update branch reference
    await octokit.git.updateRef({
      owner, repo,
      ref: `heads/${CONFIG.GITHUB_BRANCH}`,
      sha: newCommit.sha
    });

    console.log('Changes gecommit naar GitHub:', newCommit.sha);
    console.log(`- ${files.length} bestand(en) gecommit`);
    console.log('GitHub Actions zal nu automatisch deployen naar Hostinger...');
    
    return { 
      success: true, 
      commitMessage, 
      commitSha: newCommit.sha, 
      filesCommitted: files.length,
      photosCommitted: downloadedPhotos.length,
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
    
    // Download foto's
    const downloadedPhotos = await downloadPhotos(vehicleData);
    
    let deployResult = null;
    
    // Upload direct naar Hostinger via SSH (als geconfigureerd)
    if (hostinger.isConfigured()) {
      console.log('Uploading direct naar Hostinger via SSH...');
      
      // Upload vehicles.json
      const dbPath = path.join(CONFIG.DATA_DIR, 'vehicles.json');
      await hostinger.uploadVehiclesJson(dbPath);
      
      // Upload foto's
      for (const photo of downloadedPhotos) {
        const kenteken = vehicleData.kenteken || vehicleData.id;
        await hostinger.uploadPhoto(photo.localPath, kenteken, photo.filename);
      }
      
      deployResult = { method: 'Direct SSH → Hostinger', success: true };
      console.log('✅ Direct upload naar Hostinger voltooid');
    } else {
      // Fallback: Commit naar GitHub
      console.log('Hostinger niet geconfigureerd, gebruik GitHub...');
      deployResult = await commitToGitHub(vehicleData, downloadedPhotos);
    }
    
    const duration = Date.now() - startTime;
    console.log(`Webhook verwerkt in ${duration}ms`);
    console.log('Deploy methode:', deployResult.method || deployResult.deployMethod || 'GitHub Actions');
    
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
    
    // Download foto's
    const downloadedPhotos = await downloadPhotos(vehicleData);
    
    const gitResult = await commitToGitHub(vehicleData, downloadedPhotos);
    
    res.json({
      success: true,
      vehicle: vehicleData,
      gitResult,
      photosDownloaded: downloadedPhotos.length
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
  console.log('  3. Server downloadt foto\'s naar public/vwe-fotos/[kenteken]/');
  if (hostinger.isConfigured()) {
    console.log('  4. Server uploadt direct naar Hostinger via SSH ✨');
  } else {
    console.log('  4. Server commit JSON + foto\'s naar GitHub');
    console.log('  5. GitHub Actions deployed naar Hostinger ✨');
  }
  console.log('');
  console.log('Configuratie:');
  console.log(`  GitHub Repo: ${CONFIG.GITHUB_REPO}`);
  console.log(`  GitHub Branch: ${CONFIG.GITHUB_BRANCH}`);
  console.log(`  GitHub Token: ${CONFIG.GITHUB_TOKEN ? '✓ Geconfigureerd' : '✗ Niet geconfigureerd'}`);
  console.log(`  Hostinger SSH: ${hostinger.isConfigured() ? '✓ Geconfigureerd' : '✗ Niet geconfigureerd'}`);
  console.log('='.repeat(60));
});

module.exports = app;
