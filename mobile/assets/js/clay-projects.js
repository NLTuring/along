// Clay projects on this phone (IndexedDB). A project is its starting shape plus the list of
// strokes, so it reopens exactly; AI and gallery starts keep their source mesh alongside.
const DB = 'along-clay', STORE = 'projects', VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('STORAGE')); return; }
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('owner', 'owner');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('STORAGE'));
    request.onblocked = () => reject(new Error('STORAGE'));
  });
}
async function run(mode, work) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode), request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('STORAGE'));
    });
  } finally { db.close(); }
}
export const newProjectId = () => `clay_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export async function saveProject(project) { await run('readwrite', (s) => s.put({ ...project, updatedAt: Date.now() })); return project; }
export async function getProject(id, owner) { const p = await run('readonly', (s) => s.get(id)); return p && p.owner === owner ? p : null; }
export async function listProjects(owner) {
  const all = await run('readonly', (s) => s.index('owner').getAll(owner));
  return (all || []).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function removeProject(id, owner) { const p = await getProject(id, owner); if (p) await run('readwrite', (s) => s.delete(id)); }
