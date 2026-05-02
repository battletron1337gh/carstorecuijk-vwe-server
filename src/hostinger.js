/**
 * Hostinger SSH/SFTP uploader
 * Schrijft vehicles.json en foto's direct naar Hostinger server
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  host: process.env.HOSTINGER_HOST || '194.36.187.37',
  port: parseInt(process.env.HOSTINGER_PORT || '65002'),
  username: process.env.HOSTINGER_USER || 'u258982067',
  privateKey: process.env.HOSTINGER_SSH_KEY || null,
  password: process.env.HOSTINGER_PASSWORD || null,
  remotePath: process.env.HOSTINGER_REMOTE_PATH || '/home/u258982067/domains/carstorecuijk.nl/public_html'
};

/**
 * Upload file via SSH/SFTP naar Hostinger
 */
async function uploadToHostinger(localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        // Zorg dat de remote directory bestaat
        const remoteDir = path.dirname(remotePath);
        
        sftp.mkdir(remoteDir, { recursive: true }, (mkdirErr) => {
          // Ignore mkdir errors (directory might exist)
          
          const readStream = fs.createReadStream(localPath);
          const writeStream = sftp.createWriteStream(remotePath);
          
          writeStream.on('close', () => {
            conn.end();
            resolve({ success: true, remotePath });
          });
          
          writeStream.on('error', (err) => {
            conn.end();
            reject(err);
          });
          
          readStream.pipe(writeStream);
        });
      });
    });
    
    conn.on('error', (err) => {
      reject(err);
    });
    
    const connectConfig = {
      host: CONFIG.host,
      port: CONFIG.port,
      username: CONFIG.username,
    };
    
    if (CONFIG.privateKey) {
      connectConfig.privateKey = CONFIG.privateKey;
    } else if (CONFIG.password) {
      connectConfig.password = CONFIG.password;
    } else {
      return reject(new Error('Geen SSH key of password geconfigureerd'));
    }
    
    conn.connect(connectConfig);
  });
}

/**
 * Upload vehicles.json naar Hostinger
 */
async function uploadVehiclesJson(localDbPath) {
  const remotePath = `${CONFIG.remotePath}/data/vehicles.json`;
  console.log(`Uploading vehicles.json naar Hostinger...`);
  console.log(`  Local: ${localDbPath}`);
  console.log(`  Remote: ${remotePath}`);
  
  try {
    const result = await uploadToHostinger(localDbPath, remotePath);
    console.log('✅ vehicles.json geupload naar Hostinger');
    return result;
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    throw error;
  }
}

/**
 * Upload foto naar Hostinger
 */
async function uploadPhoto(localPhotoPath, kenteken, filename) {
  const remotePath = `${CONFIG.remotePath}/vwe-fotos/${kenteken}/${filename}`;
  console.log(`Uploading foto: ${filename}`);
  
  try {
    const result = await uploadToHostinger(localPhotoPath, remotePath);
    console.log(`✅ Foto geupload: ${filename}`);
    return result;
  } catch (error) {
    console.error(`❌ Foto upload failed: ${filename}`, error.message);
    throw error;
  }
}

/**
 * Check of SSH geconfigureerd is
 */
function isConfigured() {
  return !!(CONFIG.privateKey || CONFIG.password);
}

module.exports = {
  uploadToHostinger,
  uploadVehiclesJson,
  uploadPhoto,
  isConfigured,
  CONFIG
};
