import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Button,
  HTMLTable,
  Intent,
  Tag,
  Spinner,
  Callout,
  Drawer,
  Position,
  Section,
  SectionCard,
  ButtonGroup,
  Menu,
  MenuItem,
  MenuDivider,
  Popover,
  InputGroup,
  H5,
  FormGroup,
  Switch,
  Card,
} from "@blueprintjs/core";
import {
  Globe,
  Activity,
  Edit3,
  Filter,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  MapPin,
  User,
} from "lucide-react";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../utils/date";

interface LogEntry {
  id: number;
  timestamp: number;
  domain: string;
  record_type: string;
  action: "PASS" | "BLOCK" | "REDIRECT" | "FAIL";
  reason?: string;
  client_ip: string;
  geo_country?: string;
  answer?: string;
  dest_geoip?: string; // JSON string
  ecs?: string;
  profile_name?: string;
  upstream?: string;
  latency?: number;
}

interface LogsViewProps {
  profileId: string;
  onQuickAction?: (
    domain: string,
    type: "ALLOW" | "BLOCK" | "REDIRECT",
    recordType?: string,
  ) => void;
}
type TimeRange = "10m" | "1h" | "24h" | "7d" | "30d" | "custom";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isMobile;
}

function getFlagEmoji(countryCode: string) {
  if (!countryCode) return "🌐";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export const LogsView: React.FC<LogsViewProps> = ({
  profileId,
  onQuickAction,
}) => {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [range, setRange] = useState<TimeRange>("24h");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [realtimeRefresh, setRealtimeRefresh] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);

  const fetchLogs = async (
    currentRange: TimeRange,
    isInitial: boolean = true,
  ) => {
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      let url = `/api/profiles/${profileId}/logs?range=${currentRange}`;
      if (currentRange === "custom" && customRange.start && customRange.end) {
        const startTs = Math.floor(
          new Date(customRange.start).getTime() / 1000,
        );
        const endTs = Math.floor(new Date(customRange.end).getTime() / 1000);
        url += `&start=${startTs}&end=${endTs}`;
      }
      if (statusFilter) url += `&status=${statusFilter}`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (!isInitial && logs.length > 0) {
        url += `&before=${logs[logs.length - 1].timestamp}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (isInitial) {
        setLogs(data);
        setHasMore(data.length >= 50);
      } else {
        setLogs((prev) => [...prev, ...data]);
        setHasMore(data.length >= 50);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && hasMore) fetchLogs(range, false);
  }, [
    loading,
    loadingMore,
    hasMore,
    range,
    profileId,
    statusFilter,
    searchQuery,
    logs,
    customRange,
  ]);

  const lastLogElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading || loadingMore) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore) loadMore();
        },
        { root: scrollContainerRef.current, rootMargin: "200px" },
      );
      if (node) observer.current.observe(node);
    },
    [loading, loadingMore, hasMore, loadMore],
  );

  useEffect(() => {
    if (range === "custom" && (!customRange.start || !customRange.end)) return;
    const timer = setTimeout(
      () => fetchLogs(range, true),
      searchQuery ? 500 : 0,
    );
    return () => clearTimeout(timer);
  }, [profileId, range, statusFilter, searchQuery, customRange]);

  useEffect(() => {
    const autoRefreshTimer = setInterval(() => {
      if (
        realtimeRefresh &&
        scrollContainerRef.current &&
        scrollContainerRef.current.scrollTop < 50 &&
        !loadingMore &&
        !searchQuery &&
        range !== "custom"
      ) {
        fetchLogs(range, true);
      }
    }, 2000);
    return () => clearInterval(autoRefreshTimer);
  }, [profileId, range, searchQuery, realtimeRefresh]);

  const filterMenu = (
    <Menu>
      <MenuItem
        icon={statusFilter === null ? "tick" : undefined}
        text={t("logs.allStatus")}
        onClick={() => setStatusFilter(null)}
      />
      <MenuDivider />
      <MenuItem
        icon={statusFilter === "PASS" ? "tick" : undefined}
        intent={Intent.SUCCESS}
        text={t("logs.onlyPass")}
        onClick={() => setStatusFilter("PASS")}
      />
      <MenuItem
        icon={statusFilter === "BLOCK" ? "tick" : undefined}
        intent={Intent.DANGER}
        text={t("logs.onlyBlock")}
        onClick={() => setStatusFilter("BLOCK")}
      />
      <MenuItem
        icon={statusFilter === "REDIRECT" ? "tick" : undefined}
        intent={Intent.WARNING}
        text={t("logs.onlyRedirect")}
        onClick={() => setStatusFilter("REDIRECT")}
      />
    </Menu>
  );

  const getFilterLabel = () => {
    switch (statusFilter) {
      case "PASS":
        return { text: t("logs.statusPass"), intent: Intent.SUCCESS };
      case "BLOCK":
        return { text: t("logs.statusBlock"), intent: Intent.DANGER };
      case "REDIRECT":
        return { text: t("logs.statusRedirect"), intent: Intent.WARNING };
      default:
        return { text: t("logs.allStatus"), intent: Intent.NONE };
    }
  };

  const currentFilter = getFilterLabel();
  const nowStr = new Date()
    .toLocaleString("sv-SE")
    .replace(" ", "T")
    .slice(0, 16);

  if (loading && logs.length === 0)
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    );

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50/30 dark:bg-gray-950/10 max-w-7xl mx-auto w-full pt-14">
      {/* Header Area - Fixed height */}
      <div className="p-4 space-y-4 shrink-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="bp6-heading flex items-center gap-2 text-xl md:text-2xl">
              {t("logs.title")}{" "}
              <Tag minimal round>
                {range === "custom"
                  ? t("analytics.custom")
                  : range.toUpperCase()}
              </Tag>
            </h2>
            {!isMobile && (
              <p className="bp6-text-muted">{t("logs.subtitle")}</p>
            )}
          </div>

          <div className="flex flex-col items-stretch md:items-end gap-2">
            <div className="overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
              <ButtonGroup
                minimal={isMobile}
                variant={isMobile ? undefined : "minimal"}
              >
                {(["10m", "1h", "24h", "7d", "30d"] as TimeRange[]).map((r) => (
                  <Button
                    key={r}
                    active={range === r}
                    onClick={() => setRange(r)}
                    text={r.toUpperCase()}
                    small={isMobile}
                  />
                ))}
                <Popover
                  content={
                    <div className="p-4 space-y-2 w-64">
                      <H5>{t("analytics.customRange")}</H5>
                      <FormGroup label={t("analytics.startTime")}>
                        <InputGroup
                          type="datetime-local"
                          max={customRange.end || nowStr}
                          value={customRange.start}
                          onChange={(e) =>
                            setCustomRange({
                              ...customRange,
                              start: e.target.value,
                            })
                          }
                        />
                      </FormGroup>
                      <FormGroup label={t("analytics.endTime")}>
                        <InputGroup
                          type="datetime-local"
                          min={customRange.start}
                          max={nowStr}
                          value={customRange.end}
                          onChange={(e) =>
                            setCustomRange({
                              ...customRange,
                              end: e.target.value,
                            })
                          }
                        />
                      </FormGroup>
                      <Button
                        fill
                        intent={Intent.PRIMARY}
                        text={t("analytics.apply")}
                        onClick={() => {
                          setRange("custom");
                          fetchLogs("custom", true);
                        }}
                      />
                    </div>
                  }
                >
                  <Button
                    active={range === "custom"}
                    icon={<Calendar size={14} />}
                    text={isMobile ? "" : t("analytics.custom")}
                    small={isMobile}
                  />
                </Popover>
              </ButtonGroup>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-4">
              <Switch
                label={t("logs.realtime")}
                checked={realtimeRefresh}
                onChange={(e) =>
                  setRealtimeRefresh((e.target as HTMLInputElement).checked)
                }
                className="mb-0!"
              />
              <Button
                icon="refresh"
                onClick={() => fetchLogs(range, true)}
                variant="minimal"
                small={isMobile}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Popover content={filterMenu} position={Position.BOTTOM_LEFT}>
              <Button
                icon={<Filter size={14} />}
                rightIcon="caret-down"
                intent={currentFilter.intent}
                text={currentFilter.text}
                variant="outlined"
                fill={isMobile}
              />
            </Popover>
          </div>
          <div className="flex-1 md:max-w-xs">
            <InputGroup
              leftIcon="search"
              placeholder={t("logs.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              rightElement={
                searchQuery ? (
                  <Button
                    icon="cross"
                    minimal
                    onClick={() => setSearchQuery("")}
                  />
                ) : undefined
              }
              fill
            />
          </div>
        </div>
      </div>

      {/* Main Content Area - Use flex-1 and min-h-0 to let inner container scroll */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 relative"
      >
        {logs.length === 0 && !loading ? (
          <div className="py-20">
            <Callout
              title={searchQuery ? t("logs.noResults") : t("logs.noRecords")}
              icon={searchQuery ? "search" : "outdated"}
            >
              {searchQuery
                ? t("logs.noResultsDesc", { query: searchQuery })
                : t("logs.noRecordsDesc")}
            </Callout>
          </div>
        ) : isMobile ? (
          /* Mobile Card View */
          <div className="space-y-3 py-4">
            {logs.map((log, idx) => (
              <Card
                key={log.id}
                interactive
                onClick={() => {
                  setSelectedLog(log);
                  setIsDrawerOpen(true);
                }}
                className="p-3 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden"
                ref={idx === logs.length - 1 ? lastLogElementRef : null}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={`https://icons.duckduckgo.com/ip3/${log.domain.replace(/^\*\./, "")}.ico`}
                      className="w-4 h-4 rounded-sm shrink-0"
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(e) => (e.currentTarget.style.opacity = "0")}
                    />
                    <span className="font-bold text-sm truncate">
                      {log.domain}
                    </span>
                  </div>
                  <Tag
                    minimal
                    round
                    intent={
                      log.action === "PASS"
                        ? Intent.SUCCESS
                        : log.action === "BLOCK"
                          ? Intent.DANGER
                          : Intent.WARNING
                    }
                    className="text-[10px] shrink-0"
                  >
                    {log.action}
                  </Tag>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] font-mono opacity-50">
                      {new Date(log.timestamp * 1000).toLocaleTimeString([], {
                        hour12: false,
                      })}
                    </span>
                    <span className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1 rounded opacity-60">
                      {log.record_type}
                    </span>
                  </div>
                  <div className="text-[10px] opacity-40 font-mono italic">
                    {log.latency ? `${log.latency}ms` : ""}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          /* Desktop Table View */
          <div className="min-w-full inline-block align-middle py-0">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-visible">
              <HTMLTable interactive striped className="w-full table-fixed">
                <thead className="sticky top-0 z-20 backdrop-blur-md">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold uppercase text-gray-500 w-24 bg-white/80 dark:bg-gray-900/80 rounded-tl-xl border-b border-gray-100 dark:border-gray-800">
                      {t("logs.tableTime")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase text-gray-500 w-1/4 bg-white/80 dark:bg-gray-900/80 border-b border-gray-100 dark:border-gray-800">
                      {t("logs.tableDomain")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase text-gray-500 w-1/4 bg-white/80 dark:bg-gray-900/80 border-b border-gray-100 dark:border-gray-800">
                      {t("logs.tableAnswer")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase text-gray-500 w-32 bg-white/80 dark:bg-gray-900/80 border-b border-gray-100 dark:border-gray-800">
                      {t("logs.tableSource")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase text-gray-500 w-20 bg-white/80 dark:bg-gray-900/80 border-b border-gray-100 dark:border-gray-800">
                      {t("logs.tableType")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase text-gray-500 w-28 bg-white/80 dark:bg-gray-900/80 border-b border-gray-100 dark:border-gray-800">
                      {t("logs.tableStatus")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase text-gray-500 bg-white/80 dark:bg-gray-900/80 rounded-tr-xl border-b border-gray-100 dark:border-gray-800">
                      {t("logs.tableReason")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {logs.map((log, idx) => (
                    <tr
                      key={log.id}
                      onClick={() => {
                        setSelectedLog(log);
                        setIsDrawerOpen(true);
                      }}
                      className="cursor-pointer"
                      ref={idx === logs.length - 1 ? lastLogElementRef : null}
                    >
                      <td className="px-4 py-3 font-mono text-[11px] opacity-60">
                        {new Date(log.timestamp * 1000).toLocaleTimeString([], {
                          hour12: false,
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 truncate">
                          <img
                            src={`https://icons.duckduckgo.com/ip3/${log.domain.replace(/^\*\./, "")}.ico`}
                            className="w-4 h-4 rounded-sm"
                            alt=""
                            referrerPolicy="no-referrer"
                          />
                          <span className="font-bold text-sm truncate">
                            {log.domain}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 truncate font-mono text-[11px] opacity-70">
                        {log.answer || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <Tag minimal className="font-mono text-[10px]">
                          {getFlagEmoji(log.geo_country || "UN")}
                        </Tag>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <code className="text-[10px]">{log.record_type}</code>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={clsx(
                            "bp6-tag",
                            "bp6-fill",
                            "bp6-minimal",
                            "bp6-round",
                            {
                              "bp6-intent-success": log.action === "PASS",
                              "bp6-intent-danger": log.action === "BLOCK",
                              "bp6-intent-warning": log.action === "REDIRECT",
                            },
                          )}
                        >
                          <span className="bp6-text-overflow-ellipsis bp6-fill text-center">
                            {log.action}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 italic truncate">
                        {log.reason || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            </div>
          </div>
        )}

        {/* Loading Footer */}
        <div className="p-6 flex flex-col items-center">
          {loadingMore ? (
            <Spinner size={16} />
          ) : (
            !hasMore &&
            logs.length > 0 && (
              <span className="text-[10px] opacity-30 italic">
                {t("logs.loadedAll", { count: logs.length })}
              </span>
            )
          )}
        </div>
      </div>

      {/* Detail Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={t("logs.details")}
        icon="info-sign"
        position={Position.RIGHT}
        size={isMobile ? "100%" : "450px"}
        className="dark:bg-gray-900 dark:text-white shadow-none! bg-transparent! bg-bulletin! backdrop-blur-sm!"
      >
        {selectedLog && (
          <div className="p-6 space-y-4 overflow-y-auto h-full pb-safe">
            <Section
              title={t("logs.basicInfo")}
              icon={<Activity size={16} />}
              className="shadow-none! rounded-lg!"
            >
              <SectionCard>
                <div className="space-y-3">
                  <DetailItem
                    label={t("logs.detailDomain")}
                    value={
                      <div className="flex items-center gap-2 justify-end font-bold">
                        <img
                          src={`https://icons.duckduckgo.com/ip3/${selectedLog.domain}.ico`}
                          className="w-4 h-4 rounded-sm"
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) =>
                            (e.currentTarget.style.display = "none")
                          }
                        />
                        <span>{selectedLog.domain}</span>
                      </div>
                    }
                    bold
                  />
                  <DetailItem
                    label={t("logs.detailType")}
                    value={selectedLog.record_type}
                  />
                  <DetailItem
                    label={t("logs.detailLatency")}
                    value={
                      selectedLog.latency ? `${selectedLog.latency} ms` : "-"
                    }
                  />
                  <DetailItem
                    label={t("logs.detailProfile")}
                    value={selectedLog.profile_name || selectedLog.client_ip}
                  />
                  <DetailItem
                    label={t("logs.detailTime")}
                    value={formatDateTime(new Date(selectedLog.timestamp * 1000))}
                  />
                  <DetailItem
                    label={t("logs.detailStatus")}
                    value={
                      <Tag
                        minimal
                        intent={
                          selectedLog.action === "PASS"
                            ? Intent.SUCCESS
                            : Intent.DANGER
                        }
                      >
                        {selectedLog.action}
                      </Tag>
                    }
                  />
                  <DetailItem
                    label={t("logs.detailUpstream")}
                    value={selectedLog.upstream || "-"}
                  ></DetailItem>
                  <DetailItem
                    label={t("logs.detailReason")}
                    value={selectedLog.reason || t("logs.detailNoReason")}
                    italic
                  />
                  <DetailItem
                    label={t("logs.detailECS")}
                    value={selectedLog.ecs}
                    italic
                  />
                </div>
              </SectionCard>
            </Section>

            <Section
              title={t("logs.resolutionResult")}
              icon={<Globe size={16} />}
              className="shadow-none! rounded-lg!"
            >
              <SectionCard>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 font-mono text-xs break-all leading-relaxed rounded-lg">
                  {selectedLog.answer?.split(/[(,\s)|\n]/).map((ans, idx) => (
                    <div
                      key={idx}
                      className="mb-1 last:mb-0 oklch(30.2% 0.056 229.695) dark:oklch(60.9% 0.126 221.723)"
                    >
                      {ans}
                    </div>
                  )) || t("logs.noResult")}
                </div>
              </SectionCard>
            </Section>

            <Section
              title={t("logs.networkDetails")}
              icon={<User size={16} />}
              className="shadow-none! rounded-lg!"
            >
              <SectionCard>
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] uppercase font-bold opacity-50 mb-1">
                      {t("logs.clientSource")}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-mono">{selectedLog.client_ip}</span>
                      <Tag minimal title={selectedLog.geo_country || "Unknown"}>
                        {getFlagEmoji(selectedLog.geo_country || "")}
                      </Tag>
                    </div>
                  </div>
                  {selectedLog.dest_geoip && (
                    <div>
                      <div className="text-[10px] uppercase font-bold opacity-50 mb-1">
                        {t("logs.destination")}
                      </div>
                      {(() => {
                        const geo = JSON.parse(selectedLog.dest_geoip!);
                        return (
                          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                            <div className="flex items-start gap-3">
                              <MapPin
                                size={16}
                                className="oklch(60.9% 0.126 221.723) mt-1"
                              />
                              <div>
                                <div className="font-bold text-sm">
                                  {geo.city}, {geo.country}
                                </div>
                                <div className="text-xs opacity-70 mt-1">
                                  {geo.isp}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </SectionCard>
            </Section>

            <Section
              title={t("logs.quickActions")}
              icon={<Edit3 size={16} />}
              className="shadow-none! rounded-lg!"
            >
              <SectionCard>
                <div className="flex flex-col gap-2">
                  <Button
                    fill
                    intent={Intent.SUCCESS}
                    icon={<ShieldCheck size={16} />}
                    text={t("logs.actionAllow")}
                    onClick={() => onQuickAction?.(selectedLog.domain, "ALLOW")}
                  />
                  <Button
                    fill
                    intent={Intent.DANGER}
                    icon={<ShieldAlert size={16} />}
                    text={t("logs.actionBlock")}
                    onClick={() => onQuickAction?.(selectedLog.domain, "BLOCK")}
                  />
                  <Button
                    fill
                    icon={<ArrowRight size={16} />}
                    text={t("logs.actionRedirect")}
                    onClick={() =>
                      onQuickAction?.(
                        selectedLog.domain,
                        "REDIRECT",
                        selectedLog.record_type,
                      )
                    }
                  />
                </div>
              </SectionCard>
            </Section>
          </div>
        )}
      </Drawer>
    </div>
  );
};

const DetailItem = ({ label, value, bold, italic }: any) => (
  <div className="flex justify-between items-start gap-4">
    <span className="text-xs opacity-50 mt-1">{label}</span>
    <span
      className={clsx(
        "text-sm text-right",
        bold && "font-bold",
        italic && "italic",
      )}
    >
      {value}
    </span>
  </div>
);
