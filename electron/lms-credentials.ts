import { existsSync } from 'node:fs';
import { z } from 'zod';
import { readEncrypted, writeEncrypted } from './vault.js';
import type { MoodleCredential } from './moodle.js';
const schema = z.array(z.object({ connectionId: z.uuid(), siteUrl: z.string().max(2000), userId: z.number().int().positive(), token: z.string().min(1).max(2048) }).strict()).max(200);
// These secrets are deliberately separate from educational exports and SQL snapshots.
export class LmsCredentials {
  private rows: (MoodleCredential & { connectionId: string })[];
  constructor(private path: string, private key: Buffer) { this.rows = existsSync(path) ? schema.parse(JSON.parse(readEncrypted(path, key).toString('utf8'))) : []; }
  get(id: string): MoodleCredential | undefined { const row = this.rows.find(r => r.connectionId === id); return row ? { siteUrl: row.siteUrl, userId: row.userId, token: row.token } : undefined; }
  private save(rows: typeof this.rows) { writeEncrypted(this.path, Buffer.from(JSON.stringify(rows)), this.key); this.rows = rows; }
  set(connectionId: string, value: MoodleCredential) { const rows = schema.parse([...this.rows.filter(r => r.connectionId !== connectionId), { ...value, connectionId }]); this.save(rows); }
  remove(connectionId: string) { this.save(this.rows.filter(r => r.connectionId !== connectionId)); }
  prune(ids: string[]) { this.save(this.rows.filter(r => ids.includes(r.connectionId))); }
  clear() { this.save([]); }
}
