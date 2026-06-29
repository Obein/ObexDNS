import { D1Database } from "@cloudflare/workers-types";
import { User } from "../types";

export class UserModel {
  constructor(private db: D1Database) {}

  async getById(id: string): Promise<any | null> {
    return await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  }

  async getByUsername(username: string): Promise<any | null> {
    return await this.db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
  }

  async listAll(): Promise<User[]> {
    // Note regarding activity timestamps:
    // Due to schema history, `users.last_active_at` actually records the time of the last DNS resolution 
    // triggered by any of the user's profiles, NOT their web interface activity.
    // Therefore, we query the latest `timestamp` from `user_activity_log` to get the true "Last Active" time,
    // and alias `users.last_active_at` as `last_resolve_at`.
    const { results } = await this.db.prepare(`
      SELECT 
        u.id, 
        u.username, 
        u.role, 
        u.created_at, 
        u.totp_enabled,
        u.timezone,
        u.locale,
        MAX(al.timestamp) as last_active_at,
        u.last_active_at as last_resolve_at
      FROM users u
      LEFT JOIN user_activity_log al ON al.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all<User>();
    return results;
  }

  async create(user: { id: string, username: string, passwordHash: string, role: string, timezone?: string | null, locale?: string | null, passwordVersion?: number }): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db.prepare(
      "INSERT INTO users (id, username, hashed_password, role, created_at, timezone, locale, password_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(user.id, user.username, user.passwordHash, user.role, now, user.timezone || null, user.locale || 'en-US', user.passwordVersion ?? 2).run();
    return result.success;
  }

  async updateUsername(id: string, username: string): Promise<boolean> {
    const result = await this.db.prepare("UPDATE users SET username = ? WHERE id = ?").bind(username, id).run();
    return result.success;
  }

  async updateTimezone(id: string, timezone: string | null): Promise<boolean> {
    const result = await this.db.prepare("UPDATE users SET timezone = ? WHERE id = ?").bind(timezone, id).run();
    return result.success;
  }

  async updateLocale(id: string, locale: string | null): Promise<boolean> {
    const result = await this.db.prepare("UPDATE users SET locale = ? WHERE id = ?").bind(locale || 'en-US', id).run();
    return result.success;
  }

  async updatePassword(id: string, passwordHash: string, passwordVersion: number = 2): Promise<boolean> {
    const result = await this.db.prepare("UPDATE users SET hashed_password = ?, password_version = ? WHERE id = ?").bind(passwordHash, passwordVersion, id).run();
    return result.success;
  }

  async updatePinHash(id: string, pinHash: string | null): Promise<boolean> {
    const result = await this.db.prepare("UPDATE users SET pin_hash = ? WHERE id = ?").bind(pinHash, id).run();
    return result.success;
  }

  async updateSessionLockTimeout(id: string, timeout: number): Promise<boolean> {
    const result = await this.db.prepare(
      "UPDATE users SET session_lock_timeout = ? WHERE id = ?"
    ).bind(timeout, id).run();
    return result.success;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
    return result.success;
  }

  async isEmpty(): Promise<boolean> {
    const count = await this.db.prepare("SELECT COUNT(*) as count FROM users").first<number>('count');
    return count === 0;
  }

  /**
   * Activates TOTP for a user by storing the encrypted secret and hashed recovery keys.
   * @param id - User ID
   * @param secret - Base32 TOTP secret
   * @param recoveryKeysHashed - JSON array of SHA-256-hashed recovery keys
   */
  async updateTOTP(id: string, secret: string, recoveryKeysHashed: string[]): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE users SET totp_secret = ?, totp_enabled = 1, totp_skip_password = 1, totp_recovery_keys = ? WHERE id = ?')
      .bind(secret, JSON.stringify(recoveryKeysHashed), id)
      .run();
    return result.success;
  }

  /**
   * Disables TOTP and clears all TOTP-related data for a user.
   * @param id - User ID
   */
  async removeTOTP(id: string): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_skip_password = 0, totp_recovery_keys = NULL WHERE id = ?')
      .bind(id)
      .run();
    return result.success;
  }

  /**
   * Updates the skip-password setting for a user's TOTP configuration.
   * @param id - User ID
   * @param skipPassword - Whether to skip password during login
   */
  async updateTOTPSettings(id: string, skipPassword: boolean): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE users SET totp_skip_password = ? WHERE id = ?')
      .bind(skipPassword ? 1 : 0, id)
      .run();
    return result.success;
  }

  /**
   * Removes a single used recovery key from the stored hash array.
   * @param id - User ID
   * @param usedIndex - Index of the consumed key to remove
   * @param currentHashes - Current full array of hashed recovery keys
   */
  async consumeRecoveryKey(id: string, usedIndex: number, currentHashes: string[]): Promise<boolean> {
    const updated = currentHashes.filter((_, i) => i !== usedIndex);
    const result = await this.db
      .prepare('UPDATE users SET totp_recovery_keys = ? WHERE id = ?')
      .bind(JSON.stringify(updated), id)
      .run();
    return result.success;
  }

  async updateLastActiveByProfile(profileId: string, now: number): Promise<boolean> {
    const result = await this.db.prepare("UPDATE users SET last_active_at = ? WHERE id = (SELECT owner_id FROM profiles WHERE id = ?)")
      .bind(now, profileId).run();
    return result.success;
  }

  async applyInactivityPolicy(now: number): Promise<{ clearedProfiles: number; deletedUsers: number }> {
    const thirtyDaysAgo = now - (30 * 24 * 3600);
    const ninetyDaysAgo = now - (90 * 24 * 3600);

    // 1. 超过 30 天无解析记录的账户，其所有关联查询日志及 DNS 配置将被自动清理
    const deleteProfilesStmt = this.db.prepare(`
      DELETE FROM profiles 
      WHERE owner_id IN (
        SELECT id FROM users 
        WHERE role = 'user' 
          AND (last_active_at < ? OR (last_active_at IS NULL AND created_at < ?))
      )
    `).bind(thirtyDaysAgo, thirtyDaysAgo);

    // 2. 账户本身在 90 天无登录后将予移除
    const deleteUsersStmt = this.db.prepare(`
      DELETE FROM users
      WHERE role = 'user'
        AND (
          SELECT COALESCE(MAX(timestamp), created_at) 
          FROM user_activity_log 
          WHERE user_id = users.id
        ) < ?
    `).bind(ninetyDaysAgo);

    const results = await this.db.batch([deleteProfilesStmt, deleteUsersStmt]);
    return {
      clearedProfiles: results[0].meta.changes || 0,
      deletedUsers: results[1].meta.changes || 0
    };
  }
}
