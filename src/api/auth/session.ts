import { Env } from "../../types";
import {
  generateId,
  createSession, createRefreshTokenCookie,
  readRefreshTokenCookie, invalidateSession, createBlankRefreshTokenCookie,
  createPreauthSession, createPreauthCookie,
  validatePreauthSession, invalidatePreauthSession, clearPreauthCookie,
  readPreauthCookie,
  recordFailedPreauthAttempt,
  getRequestCoordinates,
  createCsrfCookie,
  getOrCreateJwtSecret, rotateSession, parseRefreshTokenString,
  extractSaltHex, hmacSha256
} from "../../lib/auth";
import { importJwtSecret, signJWT, verifyJWT } from "../../lib/jwt";
import { verifyPassword, verifyPinServer } from "../../utils/crypto";
import { verifyTOTP, findMatchingRecoveryKey } from "../../lib/totp";
import { UserModel } from "../../models/user";
import { ActivityLogModel } from "../../models/activityLog";
import { SystemSettingsModel } from "../../models/systemSettings";
import { SessionModel } from "../../models/session";
import { cacheUtils } from "../../utils/cache";
import { verifyTurnstile } from "./utils";

/**
 * Handle session lifecycle: prelogin, login, token refresh, and logout
 */
export async function handleAuthSessionRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userModel = new UserModel(env.DB);
  const activityLog = new ActivityLogModel(env.DB);
  const cache = (caches as any).default;
  const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
  const userAgent = request.headers.get("User-Agent");

  // 第一步：预登录 (只验证用户名和 Turnstile)
  if (url.pathname === '/api/auth/prelogin' && request.method === 'POST') {
    if (await cacheUtils.isRateLimited(cache, `login_fail:${clientIp}`, 10, 900)) {
      return new Response("Too many attempts", { status: 429 });
    }
    const { username, turnstileToken } = await request.json() as any;

    const settingsModel = new SystemSettingsModel(env.DB);
    const [secretKey, enabled] = await Promise.all([
      settingsModel.get('turnstile_secret_key'),
      settingsModel.get('turnstile_enabled_login')
    ]);
    if (enabled === 'true' && secretKey) {
      if (!await verifyTurnstile(turnstileToken, secretKey, clientIp)) {
        return new Response("Verification failed", { status: 400 });
      }
    }

    const user = await userModel.getByUsername(username);
    if (!user) {
      await cacheUtils.isRateLimited(cache, `login_fail:${clientIp}`, 100, 900); // penalty
      return new Response("User not found", { status: 404 });
    }

    // 签发 preauth session
    const preauthToken = await createPreauthSession(env, user.id);
    const preauthCookie = createPreauthCookie(preauthToken, env);

    const requires_password = !user.totp_skip_password;
    const requires_totp = !!user.totp_enabled;
    const password_version = user.password_version ?? 1;

    // Generate nonce for Step 2 challenge-response verification
    const nonce = generateId(32);
    let serverSalt: string | null = null;
    if (password_version === 2 && user.hashed_password) {
      serverSalt = extractSaltHex(user.hashed_password);
    }

    const preauthTtl = Number(env.PREAUTH_TTL_SECONDS) || 300;
    await cacheUtils.set(cache, `preauth_state:${preauthToken}`, { nonce, failedAttempts: 0 }, preauthTtl);

    return new Response(JSON.stringify({
      requires_password,
      requires_totp,
      password_version,
      nonce,
      serverSalt
    }), {
      headers: {
        "Set-Cookie": preauthCookie,
        "Content-Type": "application/json"
      }
    });
  }

  // 第二步：正式登录 (提交密码和/或 TOTP)
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    if (request.headers.get("X-Password-Leaked") === "true" || request.headers.get("Exposed-Credential-Check") === "true") {
      return new Response("password_leaked", { status: 400 });
    }
    if (await cacheUtils.isRateLimited(cache, `login_fail:${clientIp}`, 10, 900)) {
      return new Response("Too many login attempts", { status: 429 });
    }

    const preauthToken = readPreauthCookie(request.headers.get("Cookie"));
    if (!preauthToken) return new Response("Pre-auth session missing or expired", { status: 401 });

    const userId = await validatePreauthSession(env, preauthToken);
    if (!userId) return new Response("Session expired, please start over", { status: 401 });

    const preauthState = await cacheUtils.get<{ nonce: string, failedAttempts: number }>(cache, `preauth_state:${preauthToken}`);
    if (!preauthState) {
      await invalidatePreauthSession(env, preauthToken);
      return new Response("Session expired, please start over", { status: 401 });
    }
    const { nonce } = preauthState;

    const user = await userModel.getById(userId);
    if (!user) return new Response("User not found", { status: 404 });

    const { password, totpTokenHash, totpSalt, recoveryKey, keepLoggedIn } = await request.json() as any;

    let needsMigration = false;
    // 验证密码
    if (!user.totp_skip_password) {
      if ((user.password_version ?? 1) === 2) {
        // Nonce challenge-response validation
        const expectedResponse = await hmacSha256(user.hashed_password, nonce);
        if (password !== expectedResponse) {
          await cacheUtils.isRateLimited(cache, `login_fail:${clientIp}`, 100, 900);
          await activityLog.record(userId, 'login_fail', clientIp, userAgent, { reason: 'wrong_password' });
          const remaining = await recordFailedPreauthAttempt(cache, preauthToken, env);
          if (remaining <= 0) {
            return new Response("Invalid password", { status: 400 });
          } else {
            return new Response(`Invalid password. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`, { status: 400 });
          }
        }
      } else {
        // Plaintext validation (v1)
        const passwordValid = await verifyPassword(password, user.hashed_password, 1);
        if (!passwordValid) {
          await cacheUtils.isRateLimited(cache, `login_fail:${clientIp}`, 100, 900);
          await activityLog.record(userId, 'login_fail', clientIp, userAgent, { reason: 'wrong_password' });
          const remaining = await recordFailedPreauthAttempt(cache, preauthToken, env);
          if (remaining <= 0) {
            return new Response("Invalid password", { status: 400 });
          } else {
            return new Response(`Invalid password. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`, { status: 400 });
          }
        }
        needsMigration = true;
      }
    }

    // 验证 TOTP 或 恢复密钥
    if (user.totp_enabled) {
      if (recoveryKey) {
        let storedHashes: string[] = [];
        try { storedHashes = JSON.parse(user.totp_recovery_keys || '[]'); } catch { }
        const matchIndex = await findMatchingRecoveryKey(recoveryKey, storedHashes);
        if (matchIndex === -1) {
          await activityLog.record(userId, 'totp_verify_fail', clientIp, userAgent, { method: 'recovery_key' });
          const remaining = await recordFailedPreauthAttempt(cache, preauthToken, env);
          if (remaining <= 0) {
            return new Response("Invalid recovery key", { status: 400 });
          } else {
            return new Response(`Invalid recovery key. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`, { status: 400 });
          }
        }
        await userModel.consumeRecoveryKey(userId, matchIndex, storedHashes);
        await activityLog.record(userId, 'recovery_key_used', clientIp, userAgent, { remaining: storedHashes.length - 1 });
      } else if (totpTokenHash) {
        const isValid = await verifyTOTP(user.totp_secret || '', totpTokenHash, totpSalt);
        if (!isValid) {
          await activityLog.record(userId, 'totp_verify_fail', clientIp, userAgent);
          const remaining = await recordFailedPreauthAttempt(cache, preauthToken, env);
          if (remaining <= 0) {
            return new Response("Invalid TOTP code", { status: 400 });
          } else {
            return new Response(`Invalid TOTP code. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`, { status: 400 });
          }
        }
        await activityLog.record(userId, 'totp_verify_success', clientIp, userAgent);
      } else {
        const remaining = await recordFailedPreauthAttempt(cache, preauthToken, env);
        if (remaining <= 0) {
          return new Response("Missing TOTP code or recovery key", { status: 400 });
        } else {
          return new Response(`Missing TOTP code or recovery key. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`, { status: 400 });
        }
      }
    }

    // 所有验证通过，已消耗 preauthToken 颁发正式 Session
    await invalidatePreauthSession(env, preauthToken);
    await cacheUtils.delete(cache, `preauth_state:${preauthToken}`);
    await cacheUtils.delete(cache, `ratelimit:login_fail:${clientIp}`);
    await activityLog.record(userId, 'login_success', clientIp, userAgent);

    const { latitude, longitude } = getRequestCoordinates(request);
    if (latitude === null || longitude === null) {
      return new Response("geolocation_missing", { status: 400 });
    }
    const { session, refreshToken } = await createSession(env, userId, clientIp, userAgent, latitude, longitude, !!keepLoggedIn);
    const csrfToken = generateId(32);
    const csrfCookie = createCsrfCookie(csrfToken);

    const secret = await getOrCreateJwtSecret(env);
    const jwtKey = await importJwtSecret(secret);
    const expMinutes = Number(env.ACCESS_TOKEN_EXPIRATION_MINUTES) || 10;
    const accessToken = await signJWT({ 
      userId: userId, 
      role: user.role, 
      sessionId: session.id,
      exp: Math.floor(Date.now() / 1000) + expMinutes * 60
    }, jwtKey);

    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", createRefreshTokenCookie(refreshToken, env, !!keepLoggedIn));
    headers.append("Set-Cookie", csrfCookie);
    headers.append("Set-Cookie", clearPreauthCookie());
    
    return new Response(JSON.stringify({ success: true, accessToken, needsMigration }), { headers });
  }

  // 刷新 Token
  if (url.pathname === '/api/auth/refresh' && request.method === 'POST') {
    if (await cacheUtils.isRateLimited(cache, `refresh_fail:${clientIp}`, 20, 60)) {
      return new Response("Too many attempts", { status: 429 });
    }

    const refreshToken = readRefreshTokenCookie(request.headers.get("Cookie"));
    if (!refreshToken) return new Response("Refresh token missing", { status: 401 });

    const { latitude, longitude } = getRequestCoordinates(request);
    const { session, user, newRefreshToken, reason } = await rotateSession(env, refreshToken, latitude, longitude);

    if (!session || !user || !newRefreshToken) {
      if (user) {
        await activityLog.record(user.id, 'logout', clientIp, userAgent, { reason: reason || 'unknown' });
      }
      await cacheUtils.isRateLimited(cache, `refresh_fail:${clientIp}`, 100, 60);
      return new Response(JSON.stringify({ error: "Invalid refresh token", reason: reason || "unknown" }), { 
        status: 401,
        headers: {
          "Set-Cookie": createBlankRefreshTokenCookie(),
          "Content-Type": "application/json"
        }
      });
    }

    const secret = await getOrCreateJwtSecret(env);
    const jwtKey = await importJwtSecret(secret);
    const expMinutes = Number(env.ACCESS_TOKEN_EXPIRATION_MINUTES) || 10;
    const accessToken = await signJWT({ 
      userId: user.id, 
      role: user.role, 
      sessionId: session.id,
      exp: Math.floor(Date.now() / 1000) + expMinutes * 60
    }, jwtKey);

    const headers = new Headers({ "Content-Type": "application/json" });
    const isKeepLoggedIn = session.id.startsWith("k_");
    headers.append("Set-Cookie", createRefreshTokenCookie(newRefreshToken, env, isKeepLoggedIn));

    return new Response(JSON.stringify({ success: true, accessToken }), { headers });
  }

  // 登出
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    const refreshToken = readRefreshTokenCookie(request.headers.get("Cookie"));
    if (refreshToken) {
      // Validate refresh token just enough to get the session ID and invalidate it
      const parsed = parseRefreshTokenString(refreshToken);
      if (parsed) {
        const sessionModel = new SessionModel(env.DB);
        const userId = await sessionModel.getSessionUserId(parsed.sid);
        await invalidateSession(env, parsed.sid);
        if (userId) {
          await activityLog.record(userId, 'logout', clientIp, userAgent, { reason: 'user_active' });
        }
      }
    }
    const responseHeaders = new Headers({ "Content-Type": "application/json" });
    responseHeaders.append("Set-Cookie", createBlankRefreshTokenCookie());
    responseHeaders.append("Set-Cookie", "csrf_token=; SameSite=Lax; Path=/; Max-Age=0; Secure");
    return new Response(JSON.stringify({ success: true }), {
      headers: responseHeaders
    });
  }

  // 解锁会话
  if (url.pathname === '/api/auth/unlock-session' && request.method === 'POST') {
    const authHeader = request.headers.get("Authorization") || "";
    let accessToken = "";
    if (authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.slice(7);
    }
    if (!accessToken) return new Response("Unauthorized", { status: 401 });

    try {
      const secret = await getOrCreateJwtSecret(env);
      const jwtKey = await importJwtSecret(secret);
      const payload = await verifyJWT<{ userId: string; role: string; sessionId: string; exp: number }>(
        accessToken,
        jwtKey
      );
      if (!payload) return new Response("Unauthorized", { status: 401 });

      const { pinHash } = await request.json() as any;
      if (!pinHash) return new Response("Missing pinHash", { status: 400 });

      // 验证 Session 存在
      const sessionModel = new SessionModel(env.DB);
      const session = await sessionModel.getSession(payload.sessionId);
      if (!session) return new Response("Session not found", { status: 401 });

      // 验证用户的 PIN
      const dbUser = await userModel.getById(payload.userId);
      if (!dbUser || !dbUser.pin_hash) return new Response("PIN not configured", { status: 400 });

      const cacheKey = `unlock_fail:${session.id}`;
      const failedAttemptsState = await cacheUtils.get<{ count: number }>(cache, cacheKey);
      const failedAttempts = failedAttemptsState?.count || 0;

      const isPinValid = await verifyPinServer(pinHash, dbUser.pin_hash);
      if (!isPinValid) {
        const nextFailedCount = failedAttempts + 1;
        if (nextFailedCount >= 3) {
          // 超过 3 次失败，销毁 Session 强制登出
          await sessionModel.deleteSession(session.id);
          await cacheUtils.delete(cache, cacheKey);
          await activityLog.record(payload.userId, 'pin_verify_fail', clientIp, userAgent, { reason: 'too_many_attempts' });
          return new Response(JSON.stringify({ success: false, error: "too_many_attempts" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
          });
        }
        await cacheUtils.set(cache, cacheKey, { count: nextFailedCount }, 900); // 15分钟锁定追踪
        await activityLog.record(payload.userId, 'pin_verify_fail', clientIp, userAgent, { reason: 'incorrect_pin', attempt: nextFailedCount });
        return new Response(JSON.stringify({
          success: false,
          error: "incorrect_pin",
          attemptsRemaining: 3 - nextFailedCount
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // 验证成功：恢复会话状态
      const now = Math.floor(Date.now() / 1000);
      await sessionModel.resumeSession(session.id, now);
      await cacheUtils.delete(cache, cacheKey);
      await activityLog.record(payload.userId, 'pin_verify_success', clientIp, userAgent);

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e: any) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  return new Response("Not Found", { status: 404 });
}
