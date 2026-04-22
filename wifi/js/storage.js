const DB_NAME = 'wifiHotspotKeuanganModularDB';
const DB_VERSION = 7;
const STORES = {
  settings: 'settings',
  categories: 'categories',
  mainTransactions: 'mainTransactions',
  moduleTransactions: 'moduleTransactions',
  reserveTransactions: 'reserveTransactions',
  assets: 'assets',
  debts: 'debts',
  ipRegisters: 'ipRegisters',
  ipRegisterLogs: 'ipRegisterLogs',
  syncQueue: 'syncQueue',
  syncMeta: 'syncMeta'
};

window.DB = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORES.settings)) db.createObjectStore(STORES.settings, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(STORES.categories)) {
          const s = db.createObjectStore(STORES.categories, { keyPath: 'id' });
          s.createIndex('type', 'type', { unique: false });
          s.createIndex('parentId', 'parentId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.mainTransactions)) {
          const s = db.createObjectStore(STORES.mainTransactions, { keyPath: 'id' });
          s.createIndex('date', 'date', { unique: false });
          s.createIndex('type', 'type', { unique: false });
          s.createIndex('source', 'source', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.moduleTransactions)) {
          const s = db.createObjectStore(STORES.moduleTransactions, { keyPath: 'id' });
          s.createIndex('date', 'date', { unique: false });
          s.createIndex('moduleType', 'moduleType', { unique: false });
          s.createIndex('baseId', 'baseId', { unique: false });
          s.createIndex('actorKey', 'actorKey', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.reserveTransactions)) {
          const s = db.createObjectStore(STORES.reserveTransactions, { keyPath: 'id' });
          s.createIndex('date', 'date', { unique: false });
          s.createIndex('fundType', 'fundType', { unique: false });
          s.createIndex('entryType', 'entryType', { unique: false });
          s.createIndex('sourceMainTransactionId', 'sourceMainTransactionId', { unique: false });
        }
        let assetStore;
        if (!db.objectStoreNames.contains(STORES.assets)) {
          assetStore = db.createObjectStore(STORES.assets, { keyPath: 'id' });
        } else {
          assetStore = e.target.transaction.objectStore(STORES.assets);
        }
        if (!assetStore.indexNames.contains('assetDate')) assetStore.createIndex('assetDate', 'assetDate', { unique: false });
        if (!assetStore.indexNames.contains('assetNameKey')) assetStore.createIndex('assetNameKey', 'assetNameKey', { unique: false });
        if (!assetStore.indexNames.contains('sourceMainTransactionId')) assetStore.createIndex('sourceMainTransactionId', 'sourceMainTransactionId', { unique: false });
        if (!assetStore.indexNames.contains('assetType')) assetStore.createIndex('assetType', 'assetType', { unique: false });
        if (!assetStore.indexNames.contains('status')) assetStore.createIndex('status', 'status', { unique: false });
        if (!assetStore.indexNames.contains('usefulLifeMonths')) assetStore.createIndex('usefulLifeMonths', 'usefulLifeMonths', { unique: false });
        if (!db.objectStoreNames.contains(STORES.debts)) {
          const s = db.createObjectStore(STORES.debts, { keyPath: 'id' });
          s.createIndex('debtDate', 'debtDate', { unique: false });
          s.createIndex('period', 'period', { unique: false });
          s.createIndex('status', 'status', { unique: false });
          s.createIndex('recipientType', 'recipientType', { unique: false });
          s.createIndex('sourceRowKey', 'sourceRowKey', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.ipRegisters)) {
          const s = db.createObjectStore(STORES.ipRegisters, { keyPath: 'id' });
          s.createIndex('seqNo', 'seqNo', { unique: false });
          s.createIndex('ipAddress', 'ipAddress', { unique: false });
          s.createIndex('status', 'status', { unique: false });
          s.createIndex('locationKey', 'locationKey', { unique: false });
          s.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.ipRegisterLogs)) {
          const s = db.createObjectStore(STORES.ipRegisterLogs, { keyPath: 'id' });
          s.createIndex('registerId', 'registerId', { unique: false });
          s.createIndex('eventDate', 'eventDate', { unique: false });
          s.createIndex('eventType', 'eventType', { unique: false });
          s.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.syncQueue)) {
          const s = db.createObjectStore(STORES.syncQueue, { keyPath: 'id' });
          s.createIndex('status', 'status', { unique: false });
          s.createIndex('storeName', 'storeName', { unique: false });
          s.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.syncMeta)) db.createObjectStore(STORES.syncMeta, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  },
  async tx(store, mode='readonly') {
    const db = await this.open();
    return db.transaction(store, mode).objectStore(store);
  },
  async getAll(store) {
    const objectStore = await this.tx(store);
    return new Promise((resolve, reject) => {
      const req = objectStore.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  async get(store, key) {
    const objectStore = await this.tx(store);
    return new Promise((resolve, reject) => {
      const req = objectStore.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async getByIndex(store, indexName, value) {
    const objectStore = await this.tx(store);
    return new Promise((resolve, reject) => {
      const index = objectStore.index(indexName);
      const req = index.get(value);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },
  async put(store, value) {
    const objectStore = await this.tx(store, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = objectStore.put(value);
      req.onsuccess = () => resolve(value);
      req.onerror = () => reject(req.error);
    });
  },
  async delete(store, key) {
    const objectStore = await this.tx(store, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = objectStore.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },
  async clear(store) {
    const objectStore = await this.tx(store, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = objectStore.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }
};
