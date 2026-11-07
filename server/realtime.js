import { db } from './db.js';

/** @type {Set<{res: import('express').Response, token: string, userId: number, role: string, actingAs: number|null, name: string, deviceId: string, page: string}>} */
const clients = new Set();

/** token -> { page, lastSeen } */
const presence = new Map();

export function addClient(client) {
  clients.add(client);
  presence.set(client.token, { page: client.page || '/dashboard', lastSeen: Date.now() });
  broadcastPresence();
}

export function removeClient(client) {
  clients.delete(client);
  presence.delete(client.token);
  broadcastPresence();
}

export function setPage(token, page) {
  const p = presence.get(token);
  if (p) {
    p.page = page;
    p.lastSeen = Date.now();
  }
  broadcastPresence();
}

function send(client, event, data) {
  try {
    client.res.write(`event: ${event}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    removeClient(client);
  }
}

export function broadcast(event, data, filter = () => true) {
  for (const c of clients) if (filter(c)) send(c, event, data);
}

export function broadcastPresence() {
  const now = Date.now();
  const byUser = new Map();
  for (const c of clients) {
    const p = presence.get(c.token);
    if (!p) continue;
    if (now - p.lastSeen > 90_000) continue;
    const effectiveId = c.actingAs || c.userId;
    const entry = byUser.get(effectiveId) || { userId: effectiveId, name: c.name, pages: new Set(), devices: new Set() };
    entry.pages.add(p.page || '/dashboard');
    entry.devices.add(c.deviceId);
    byUser.set(effectiveId, entry);
  }
  const online = [...byUser.values()].map((e) => ({
    userId: e.userId,
    name: e.name,
    page: [...e.pages][0],
    pages: [...e.pages],
    devices: e.devices.size
  }));
  const payload = { online, onlineCount: online.length };
  broadcast('presence', payload, (c) => c.role === 'owner' || c.role === 'admin');
  broadcast('presence-self', { onlineCount: online.length }, () => true);
}

export function recentActivity(limit = 60) {
  return db
    .prepare(
      `SELECT a.id, a.action, a.detail, a.page, a.created_at, a.user_id, a.actor_id,
              u.name AS user_name, u.role AS user_role
       FROM activity a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.id DESC LIMIT ?`
    )
    .all(limit);
}

export function onlineSummary() {
  const now = Date.now();
  const seen = new Map();
  for (const c of clients) {
    const p = presence.get(c.token);
    if (!p) continue;
    if (now - p.lastSeen > 90_000) continue;
    seen.set(c.actingAs || c.userId, true);
  }
  return seen.size;
}
