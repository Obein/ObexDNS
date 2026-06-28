import { Env, ExecutionContext } from "../types";
import { BloomFilter } from "./bloom";
import { fetchListContent } from "./listFetcher";
import { pipelineCache } from "../pipeline/cache";
import { ProfileModel } from "../models/profile";
import { ListModel } from "../models/list";
import { ProfileBloomModel } from "../models/profileBloom";
import { ListBloomModel } from "../models/listBloom";

// ─── 常量 ─────────────────────────────────────────────────────────────────────

/** 单个列表的字节数上限（5 MB）。超出后软截断，已读部分仍可使用。 */
const MAX_LIST_BYTES = 5 * 1024 * 1024;

// ─── 内部工具 ─────────────────────────────────────────────────────────────────

/**
 * 汇总并合并所有已启用列表的 Bloom Filter，并将其原子更新为 Profile 的 active Bloom。
 *
 * 在同步周期结束（或手动同步结束）时调用：
 *   1. 载入该 Profile 下所有已启用列表的 list-level Bloom Filter（来自 `list_blooms`）。
 *   2. 若包含有效的列表 Bloom，通过按位或 (OR) 操作合并它们，存入 `profile_blooms` 作为 DNS 解析的单一主 filter。
 *   3. 如果没有已同步的列表，则直接清空该 Profile 的 active Bloom。
 *   4. 更新 `profile.list_updated_at` 为当前时间，退出同步队列。
 *   5. 异步清空 DNS 解析层内存缓存，使更新立即对后续解析生效。
 */
async function combineAndPromote(
  profileId: string,
  listBloomModel: ListBloomModel,
  profileBloomModel: ProfileBloomModel,
  profileModel: ProfileModel,
  ctx: ExecutionContext,
  now: number,
  maxDomains: number,
  falsePositiveRate: number
): Promise<void> {
  const listBlooms = await listBloomModel.getActiveListBloomsForProfile(profileId);

  if (listBlooms.length === 0) {
    // 若没有已同步的列表，清空 profile_blooms
    await profileBloomModel.clearProfileBlooms(profileId);
  } else {
    // 重建并按位或 (OR) 合并所有列表级布隆过滤器
    const merged = BloomFilter.create(maxDomains, falsePositiveRate);
    for (const buf of listBlooms) {
      try {
        const filter = BloomFilter.fromUint8Array(new Uint8Array(buf));
        merged.merge(filter);
      } catch (err) {
        console.error(`[Sync] Failed to merge list bloom for Profile ${profileId}:`, err);
      }
    }
    const binary = merged.toUint8Array();
    await profileBloomModel.upsertProfileBloom(profileId, binary.buffer as ArrayBuffer, now);
  }

  // 更新 Profile 主表的更新时间，完成同步周期
  await profileModel.updateListUpdatedAt(profileId, now);

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(pipelineCache.clear(profileId));
  }
}

// ─── 公开 API ─────────────────────────────────────────────────────────────────

/**
 * 【Cron 专用】每次触发时处理**单个**最旧的订阅列表。
 *
 * ## 新增列表级 Bloom 缓存设计 (A/B OR 合并策略)
 *
 * 1. **跳过拉取与旧列表沿用**：当下载/拉取某个列表失败时，跳过该列表的处理，
 *    直接沿用数据库 `list_blooms` 中缓存的该列表上一次成功同步的 Bloom 过滤器，
 *    同时通过 `sync_error` 字段在 D1 中更新记录失败原因，保持列表 `enabled` 不变。
 * 2. **原子按位或合并**：列表处理完成后，重新计算已启用列表的同步状态。
 *    若本周期所有列表处理完毕，则将 `list_blooms` 表中该 profile 的所有最新/沿用的 Bloom Filter
 *    取出并进行按位或 (OR) 合并，最后原子级存入 `profile_blooms` 作为解析过滤的主数据。
 */
export async function syncNextListForProfile(
  profileId: string,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const profileModel = new ProfileModel(env.DB);
  const listModel = new ListModel(env.DB);
  const profileBloomModel = new ProfileBloomModel(env.DB);
  const listBloomModel = new ListBloomModel(env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const profile = await profileModel.getById(profileId);
    if (!profile) {
      console.error(`[Sync] Profile ${profileId} not found.`);
      return;
    }

    const lastFullSync: number = profile.list_updated_at ?? 0;
    const lists = await listModel.getLists(profileId);
    const activeLists = lists.filter((l) => !!l.enabled);

    if (activeLists.length === 0) {
      await profileBloomModel.clearProfileBlooms(profileId);
      await profileModel.updateListUpdatedAt(profileId, now);
      return;
    }

    // ── 新周期检测 ────────────────────────────────────────────────────────────
    const isNewCycle = !activeLists.some((l) => (l.last_synced_at ?? 0) > lastFullSync);

    if (isNewCycle) {
      console.log(`[Sync] Profile ${profileId}: starting a new sync cycle.`);
    }

    // ── 选取下一个待同步列表 ──────────────────────────────────────────────────
    const pendingLists = activeLists
      .filter((l) => (l.last_synced_at ?? 0) <= lastFullSync)
      .sort((a, b) => (a.last_synced_at ?? 0) - (b.last_synced_at ?? 0));

    if (pendingLists.length === 0) {
      // 逻辑重入边际情况：所有列表已完成，进行合并
      const maxDomains = Number(env.MAX_SYNC_DOMAINS) || 1000000;
      const falsePositiveRate = Number(env.BLOOM_FALSE_POSITIVE_RATE) || 0.0001;
      await combineAndPromote(
        profileId,
        listBloomModel,
        profileBloomModel,
        profileModel,
        ctx,
        now,
        maxDomains,
        falsePositiveRate
      );
      return;
    }

    // ── 处理单个列表 ──────────────────────────────────────────────────────────
    const list = pendingLists[0];
    const timeoutMs = Number(env.SYNC_TIMEOUT_MS) || 30000;

    const { domains, error: fetchError } = await fetchListContent(
      list.url,
      MAX_LIST_BYTES,
      timeoutMs
    );

    const maxListDomains = Number(env.MAX_LIST_DOMAINS) || 150000;
    const maxDomains = Number(env.MAX_SYNC_DOMAINS) || 1000000;
    const falsePositiveRate = Number(env.BLOOM_FALSE_POSITIVE_RATE) || 0.0001;

    let syncError: string | null = fetchError;

    if (!fetchError) {
      // 创建对应此列表的独立布隆过滤器
      const listBloom = BloomFilter.create(maxDomains, falsePositiveRate);
      const limit = Math.min(domains.length, maxListDomains);
      if (domains.length > maxListDomains) {
        console.warn(
          `[Sync] Domain list truncated to ${maxListDomains} (was ${domains.length}).`
        );
      }

      for (let i = 0; i < limit; i++) {
        listBloom.add(domains[i]);
      }

      // 写入列表级布隆过滤器到数据库
      await listBloomModel.upsertListBloom(list.id, listBloom.toUint8Array().buffer as ArrayBuffer, now);
      console.log(
        `[Sync] Profile ${profileId}: successfully updated list #${list.id} with ${limit} domains.`
      );
    } else {
      // 拉取失败：跳过，并沿用原有列表缓存，记录错误原因，保持启用状态
      console.warn(
        `[Sync] Profile ${profileId}: failed to fetch list #${list.id}. ` +
          `Skipping and keeping old bloom. Error: ${fetchError}`
      );
    }

    // 无论成功还是失败，都更新 last_synced_at 并保持 enabled 开启
    await listModel.updateListSyncStatus(list.id, now, 1, syncError);

    // ── 检查本周期是否全部完成 ────────────────────────────────────────────────
    const updatedLists = await listModel.getLists(profileId);
    const activeUpdatedLists = updatedLists.filter((l) => !!l.enabled);
    const allDone = activeUpdatedLists.every((l) => (l.last_synced_at ?? 0) > lastFullSync);

    if (allDone) {
      await combineAndPromote(
        profileId,
        listBloomModel,
        profileBloomModel,
        profileModel,
        ctx,
        now,
        maxDomains,
        falsePositiveRate
      );
      console.log(
        `[Sync] Profile ${profileId}: all ${activeUpdatedLists.length} list(s) processed — ` +
          `promoted combined active bloom.`
      );
    } else {
      const remaining = activeUpdatedLists.filter(
        (l) => (l.last_synced_at ?? 0) <= lastFullSync
      ).length;
      console.log(
        `[Sync] Profile ${profileId}: ${remaining} active list(s) remaining in this cycle.`
      );
    }
  } catch (e) {
    console.error(`[Sync] Critical failure for Profile ${profileId}:`, e);
    // 防止单点故障永久阻塞
    await profileModel.updateListUpdatedAt(profileId, now);
  }
}
