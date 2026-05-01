const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let db = null;

async function connectDB() {
  if (db) return db;
  await client.connect();
  db = client.db('carstorecuijk');
  return db;
}

async function saveVehicle(vehicleData) {
  const db = await connectDB();
  const collection = db.collection('vehicles');
  
  await collection.updateOne(
    { kenteken: vehicleData.kenteken },
    { $set: vehicleData },
    { upsert: true }
  );
  return vehicleData;
}

async function getVehicles() {
  const db = await connectDB();
  const collection = db.collection('vehicles');
  return await collection.find({}).toArray();
}

async function deleteVehicle(kenteken) {
  const db = await connectDB();
  const collection = db.collection('vehicles');
  await collection.deleteOne({ kenteken });
}

module.exports = { saveVehicle, getVehicles, deleteVehicle };
