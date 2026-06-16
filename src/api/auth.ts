import { Env } from "../types";
import { handleAuthConfigRequest } from "./auth/config";
import { handleAuthRegisterRequest } from "./auth/register";
import { handleAuthSessionRequest } from "./auth/session";

/**
 * Handle authentication related requests by delegating to specialized handlers.
 */
export async function handleAuthRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 公开配置与辅助接口
  if (path === '/api/auth/config' || path === '/api/auth/check-username') {
    return handleAuthConfigRequest(request, env);
  }

  // 注册接口
  if (path === '/api/auth/signup') {
    return handleAuthRegisterRequest(request, env);
  }

  // 会话生命周期接口
  if (
    path === '/api/auth/prelogin' ||
    path === '/api/auth/login' ||
    path === '/api/auth/refresh' ||
    path === '/api/auth/logout'
  ) {
    return handleAuthSessionRequest(request, env);
  }

  return new Response("Not Found", { status: 404 });
}
