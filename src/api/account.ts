import { Env, User, ExecutionContext } from "../types";
import { RBAC } from "../lib/rbac";
import { handlePersonalAccountRequest } from "./account/personal";
import { handleAdminRequest } from "./account/admin";

export async function handleAccountRequest(
  request: Request,
  env: Env,
  user: User,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // ─── 个人账号接口 (/api/account/...) ───
  if (pathParts[1] === 'account') {
    return handlePersonalAccountRequest(request, env, user, pathParts, ctx);
  }

  // ─── 管理员接口 (/api/admin/...) ───
  if (pathParts[1] === 'admin') {
    if (!RBAC.isAdmin(user)) return new Response("Forbidden", { status: 403 });
    return handleAdminRequest(request, env, user, pathParts, ctx);
  }

  return new Response("Not Found", { status: 404 });
}
