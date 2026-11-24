import type { Services, User } from './core.js';
import { fail } from './core.js';

// Who may read a workshop file. Shared by the cookie/bearer routes and phone file tickets.
// Covers of public works are open to members; a model needs ownership, an unlock or admin.
export const workshopPath = /^\/api\/(gallery|ai-models)\/([a-zA-Z0-9_-]{1,128})\/(cover|model|glb)$/;
export async function workshopFile(s: Services, user: User | null, kind: string, resourceId: string, part: string) {
  if (kind === 'ai-models') {
    const row = part === 'glb' ? await s.db.one('SELECT * FROM ai_model_jobs WHERE id=$1', [resourceId]) : undefined;
    if (!row || !user || (row.owner_id !== user.id && user.role !== 'ADMIN') || row.status !== 'READY' || !row.model_key) return fail(404, 'NOT_FOUND');
    return { key: row.model_key as string, mime: 'model/gltf-binary', filename: `along-ai-${row.id}.glb` };
  }
  const row = part === 'cover' || part === 'model' ? await s.db.one('SELECT * FROM gallery_works WHERE id=$1', [resourceId]) : undefined;
  if (!row) return fail(404, 'NOT_FOUND');
  const privileged = Boolean(user && (row.owner_id === user.id || user.role === 'ADMIN'));
  if (part === 'cover') {
    if (!privileged && row.status !== 'PUBLIC') fail(404, 'NOT_FOUND');
    return { key: row.cover_key as string, mime: 'image/png' };
  }
  if (!row.model_key) return fail(404, 'NOT_FOUND');
  if (!privileged) {
    if (!user || row.status !== 'PUBLIC') fail(404, 'NOT_FOUND');
    const unlocked = await s.db.one('SELECT 1 AS one FROM gallery_unlocks WHERE work_id=$1 AND user_id=$2', [row.id, user!.id]);
    if (!unlocked) fail(402, 'UNLOCK_REQUIRED');
  }
  return { key: row.model_key as string, mime: 'model/gltf-binary', filename: `along-gallery-${row.id}.glb` };
}
