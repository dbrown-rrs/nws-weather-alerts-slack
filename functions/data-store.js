const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const PROCESSED_ALERTS_FILE = path.join(DATA_DIR, 'processed_alerts.json');

const DEFAULT_FEEDS = [
  {
    id: 'feed_njz103',
    url: 'https://api.weather.gov/alerts/active.atom?zone=NJZ103',
    zone: 'NJZ103',
    name: 'Western Bergen County, NJ',
    active: true,
    addedBy: 'system',
    addedAt: new Date().toISOString()
  },
  {
    id: 'feed_njz104',
    url: 'https://api.weather.gov/alerts/active.atom?zone=NJZ104',
    zone: 'NJZ104',
    name: 'Eastern Bergen County, NJ',
    active: true,
    addedBy: 'system',
    addedAt: new Date().toISOString()
  }
];

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function loadSubscriptions() {
  await ensureDataDir();
  try {
    const data = await fs.readFile(SUBSCRIPTIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(DEFAULT_FEEDS, null, 2));
    return DEFAULT_FEEDS;
  }
}

async function saveSubscriptions(subscriptions) {
  await ensureDataDir();
  await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
}

async function loadProcessedAlerts() {
  await ensureDataDir();
  try {
    const data = await fs.readFile(PROCESSED_ALERTS_FILE, 'utf8');
    const alerts = JSON.parse(data);
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const filtered = alerts.filter(a => new Date(a.processedAt).getTime() > cutoff);
    if (filtered.length !== alerts.length) {
      await saveProcessedAlerts(filtered);
    }
    return filtered;
  } catch {
    return [];
  }
}

async function saveProcessedAlerts(alerts) {
  await ensureDataDir();
  await fs.writeFile(PROCESSED_ALERTS_FILE, JSON.stringify(alerts, null, 2));
}

async function getSubscriptions() {
  return await loadSubscriptions();
}

async function addSubscription(subscription) {
  const subscriptions = await loadSubscriptions();
  const newSub = {
    id: `feed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ...subscription,
    addedAt: new Date().toISOString()
  };
  subscriptions.push(newSub);
  await saveSubscriptions(subscriptions);
  return newSub;
}

async function removeSubscription(id) {
  const subscriptions = await loadSubscriptions();
  const filtered = subscriptions.filter(s => s.id !== id);
  await saveSubscriptions(filtered);
}

async function toggleSubscription(id) {
  const subscriptions = await loadSubscriptions();
  const sub = subscriptions.find(s => s.id === id);
  if (sub) {
    sub.active = !sub.active;
    await saveSubscriptions(subscriptions);
  }
}

async function updateSubscription(id, updates) {
  const subscriptions = await loadSubscriptions();
  const index = subscriptions.findIndex(s => s.id === id);
  if (index !== -1) {
    subscriptions[index] = { ...subscriptions[index], ...updates };
    await saveSubscriptions(subscriptions);
  }
}

async function getProcessedAlerts() {
  const alerts = await loadProcessedAlerts();
  return new Set(alerts.map(a => a.id));
}

async function markAlertAsProcessed(alertId) {
  const alerts = await loadProcessedAlerts();
  alerts.push({
    id: alertId,
    processedAt: new Date().toISOString()
  });
  await saveProcessedAlerts(alerts);
}

module.exports = {
  getSubscriptions,
  addSubscription,
  removeSubscription,
  toggleSubscription,
  updateSubscription,
  getProcessedAlerts,
  markAlertAsProcessed
};