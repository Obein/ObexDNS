import { D1Database } from "@cloudflare/workers-types";

export class SystemSecretsModel {
  constructor(private db: D1Database) {}

  async get(key: 'jwt_secret' | 'turnstile_secret_key'): Promise<string | null> {
    const res = await this.db.prepare("SELECT value FROM system_secrets WHERE key = ?").bind(key).first<{value: string}>();
    return res ? res.value : null;
  }

  async set(key: 'jwt_secret' | 'turnstile_secret_key', value: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db.prepare(
      "INSERT INTO system_secrets (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
    ).bind(key, value, now).run();
    return result.success;
  }
}
