import { Env, User, ExecutionContext } from "../../types";
import { createBlankRefreshTokenCookie, readRefreshTokenCookie, parseRefreshTokenString } from "../../lib/auth";
import { UserModel } from "../../models/user";
import { LogModel } from "../../models/log";

/**
 * Handle requests to /api/account/me, /api/account/logs, /api/account/delete
 */
export async function handleMeRequest(
  request: Request,
  env: Env,
  user: User,
  pathParts: string[],
  ctx: ExecutionContext
): Promise<Response> {
  const userModel = new UserModel(env.DB);
  const logModel = new LogModel(env.DB);
  const action = pathParts[2];

  // GET /api/account/me & PATCH /api/account/me
  if (action === 'me') {
    if (request.method === 'GET') {
      const dbUser = await userModel.getById(user.id);
      return new Response(JSON.stringify({
        id: user.id,
        username: dbUser?.username || "",
        role: user.role,
        totp_enabled: !!(dbUser?.totp_enabled),
        totp_skip_password: !!(dbUser?.totp_skip_password),
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'PATCH') {
      const { username: newUsername } = await request.json() as any;
      if (!newUsername || !/^[a-z_][a-z0-9_-]{4,31}$/.test(newUsername)) {
        return new Response("Username format error", { status: 400 });
      }
      try {
        await userModel.updateUsername(user.id, newUsername);
        return new Response(JSON.stringify({ success: true }));
      } catch (e: any) {
        if (e.message?.includes("UNIQUE constraint failed")) return new Response("The username is already taken", { status: 400 });
        return new Response("Failed to update username", { status: 500 });
      }
    }

    return new Response("Method Not Allowed", { status: 405 });
  }

  // DELETE /api/account/logs
  if (action === 'logs' && request.method === 'DELETE') {
    await logModel.deleteByOwner(user.id);
    return new Response(JSON.stringify({ success: true }));
  }

  // POST /api/account/delete (delete account)
  if (action === 'delete' && request.method === 'POST') {
    const { invalidateSession } = await import("../../lib/auth");
    const cookieHeader = request.headers.get("Cookie") || "";
    const refreshToken = readRefreshTokenCookie(cookieHeader);
    const sessionId = refreshToken ? parseRefreshTokenString(refreshToken)?.sid || null : null;
    if (sessionId) await invalidateSession(env, sessionId);
    await userModel.delete(user.id);
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Set-Cookie": createBlankRefreshTokenCookie(), "Content-Type": "application/json" }
    });
  }

  return new Response("Not Found", { status: 404 });
}
