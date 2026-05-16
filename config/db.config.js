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
  "publicContents": "publicContents",
  "messages": "messages",
  "roles": "roles",
  "suppliers": "suppliers",
  "supplierPayments": "supplierPayments",
  "settings": "settings",
  "tutorialNodes": "tutorialNodes",
  "translations": "translations",
  "routes": "routes",
  "branding": "branding",
  "withdrawals": "withdrawals",
  "appTokens":   "appTokens",
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
  "publicContents": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
    {
      key: { slug: 1 },
      options: { unique: true }
    },
  ],
  "messages": [
    {
      key: { id: 1 },
      options: { unique: true }
    },
    {
      key: { from_id: 1 },
      options: {}
    },
    {
      key: { type: 1, createdAt: -1 },
      options: {}
    },
  ],
  "roles": [
    { key: { id: 1 }, options: { unique: true } },
    { key: { name: 1 }, options: { unique: true } },
  ],
  "suppliers": [
    { key: { id: 1 }, options: { unique: true } },
    { key: { name: 1 }, options: {} },
    { key: { category: 1 }, options: {} },
  ],
  "supplierPayments": [
    { key: { id: 1 }, options: { unique: true } },
    { key: { supplierId: 1 }, options: {} },
    { key: { period: 1 }, options: {} },
    { key: { state: 1 }, options: {} },
    { key: { paidAt: -1 }, options: {} },
  ],
  "settings": [
    { key: { key: 1 }, options: { unique: true } },
  ],
  "tutorialNodes": [
    { key: { id: 1 }, options: { unique: true } },
  ],
  "translations": [
    { key: { key: 1 }, options: { unique: true } },
  ],
  "routes": [
    { key: { id: 1 },  options: { unique: true } },
    { key: { key: 1 }, options: { unique: true } },
  ],
  "branding": [
    { key: { singleton: 1 }, options: { unique: true } },
  ],
  "withdrawals": [
    { key: { id: 1 },      options: { unique: true } },
    { key: { type: 1 },    options: {} },
    { key: { state: 1 },   options: {} },
    { key: { period: 1 },  options: {} },
    { key: { executedAt: -1 }, options: {} },
  ],
  "appTokens": [
    { key: { id: 1 },        options: { unique: true } },
    { key: { host: 1 },      options: {} },
    { key: { active: 1 },    options: {} },
    { key: { createdAt: -1}, options: {} },
  ],
}
module.exports = {
    nameCollections,
    collectionIndex
}
