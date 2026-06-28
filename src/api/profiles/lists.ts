import { Env, User, ExecutionContext } from "../../types";
import { ListModel } from "../../models/list";
import { ProfileModel } from "../../models/profile";
import { syncNextListForProfile } from "../../utils/sync";
import { isSafeUrl } from "../../utils/validator";
import { pipeline } from "../../pipeline";

/**
 * Handle filter lists requests to /api/profiles/:id/lists
 */
export async function handleProfileListsRequest(
  request: Request,
  env: Env,
  user: User,
  profileId: string,
  pathParts: string[],
  ctx: ExecutionContext
): Promise<Response> {
  const listModel = new ListModel(env.DB);
  const profileModel = new ProfileModel(env.DB);

  if (request.method === 'GET') {
    const results = await listModel.getLists(profileId);
    return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
  }

  if (request.method === 'POST') {
    if (pathParts[4] === 'sync') {
      // 重置同步状态，使得 Cron 或者是接下来的异步任务可以逐个处理列表
      await listModel.resetListSyncStatus(profileId);
      await profileModel.updateListUpdatedAt(profileId, 0);
      
      // 触发首个列表的同步
      ctx.waitUntil(syncNextListForProfile(profileId, env, ctx));
      return new Response(JSON.stringify({ message: "Sync started" }), { status: 202 });
    }

    const { url: listUrl } = await request.json() as { url: string };
    if (!listUrl || (!listUrl.startsWith('http://') && !listUrl.startsWith('https://'))) {
      return new Response("Invalid list URL format", { status: 400 });
    }
    if (!isSafeUrl(listUrl)) {
      return new Response("Invalid list URL. Private networks and localhosts are not allowed.", { status: 400 });
    }
    
    await listModel.addList(profileId, listUrl);
    // 只触发新添加列表的同步 (syncNextListForProfile 会挑选未同步的最旧列表，即此新列表)
    ctx.waitUntil(syncNextListForProfile(profileId, env, ctx));
    ctx.waitUntil(pipeline.clearCache(profileId));
    return new Response(null, { status: 201 });
  }

  if (request.method === 'DELETE') {
    const { id } = await request.json() as { id: number };
    await listModel.deleteList(id, profileId);
    // 触发重构合并 (没有 pending 列表，syncNextListForProfile 会直接运行 combineAndPromote)
    ctx.waitUntil(syncNextListForProfile(profileId, env, ctx));
    ctx.waitUntil(pipeline.clearCache(profileId));
    return new Response(null, { status: 204 });
  }

  return new Response("Method Not Allowed", { status: 405 });
}
