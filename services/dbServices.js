const { MongoClient } = require('mongodb');
const { collectionIndex, nameCollections } = require('../config/db.config');
const { registerStreams } = require("../streams/registerStreams")
const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DBNAME;

let client;
let db;
// let nameCollections = {
//   "admin": "admin",
//   "servers": "servers",
//   "devices": "devices",
//   "payments": "payments",
//   "sessions": "sessions",
//   "periods": "periods",
//   "countries": "countries",
//   "plans": "plans",
//   "certificates": "certificates",
//   "bankAccount": "bankAccount",
//   "activitiesDevice": "activitiesDevice",
//   "services": "services",
//   "binnacle": "binnacle",
//   "terms": "terms",
//   "languages": "languages",
//   "coins": "coins",
//   "continents": "continents",
//   "apps": "apps",
// }
// let collectionIndex = {
//   "admin": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//     {
//       key: { email: 1 },
//       options: { unique: true }
//     }
//   ],
//   "servers": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "devices": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "payments": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "sessions": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//     {
//       key: { expiresAt: 1 },
//       options: { expireAfterSeconds: 0 }
//     }
//   ],
//   "periods": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "countries": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "plans": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "certificates": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "bankAccount": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "activitiesDevice": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "services": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "binnacle": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "terms": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "languages": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "coins": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "continents": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
//   "apps": [
//     {
//       key: { id: 1 },
//       options: { unique: true }
//     },
//   ],
// }
async function connectMongo() {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);

    console.log(`✅ [DB] Conectado a MongoDB (${dbName})`)
    await createCollections();
    await registerStreams(db);
  }
}
function getDB() {
  if (!db) throw new Error('❌ [DB] No conectado');
  return db;
}
async function createCollections() {
  for (const collName of Object.values(nameCollections)) {
    const collections = await db.listCollections({ name: collName }).toArray();
    if (collections.length === 0) {
      await db.createCollection(collName);
    }

    const indexes = collectionIndex[collName] || [];
    for (const { key, options } of indexes) {
      await db.collection(collName).createIndex(key, options);
    }
  }
  console.log("✅ [DB] Colecciones e índices creados correctamente");
}
module.exports = {
  connectMongo,
  getDB,
  nameCollections
}