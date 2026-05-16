let nameCollections = {
  "admin": "admin",
  "servers": "servers",
  "devices": "devices",
  "payments": "payments",
  "sessions": "sessions",
  "periods": "periods",
  "countries": "countries",
  "plans": "plans",
  "certificates": "certificates",
  "bankAccount": "bankAccount",
  "activitiesDevice": "activitiesDevice",
  "services": "services",
  "binnacle": "binnacle",
  "terms": "terms",
  "languages": "languages",
  "coins": "coins",
  "continents": "continents",
  "apps": "apps",
  "paymentsTemplates": "paymentsTemplates",
  "routes": "routes",
  "roles":  "roles",
}
let collectionIndex = {
  "admin": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
    {
      key: { email: 1 },
      options: { unique: true }
    }
  ],
  "servers": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "devices": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "payments": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "sessions": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
    {
      key: { expiresAt: 1 },
      options: { expireAfterSeconds: 0 }
    }
  ],
  "periods": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "countries": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "plans": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "certificates": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "bankAccount": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "activitiesDevice": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "services": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "binnacle": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "terms": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "languages": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "coins": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "continents": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "apps": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "paymentsTemplates": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
  ],
  "routes": [
    { key: { id: 1 },  options: { unique: true } },
    { key: { key: 1 }, options: { unique: true } },
  ],
  "roles": [
    { key: { id: 1 },   options: { unique: true } },
    { key: { name: 1 }, options: { unique: true } },
  ],
}
module.exports = {
    nameCollections,
    collectionIndex
}