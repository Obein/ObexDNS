import React from "react";
import { ButtonGroup, Button, PopoverNext, H5, FormGroup, InputGroup, Intent } from "@blueprintjs/core";
import { Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TimeRange } from "../types";

export interface TimeRangeSelectorProps {
  range: TimeRange;
  setRange: (r: TimeRange) => void;
  customRange: { start: string; end: string };
  setCustomRange: (cr: { start: string; end: string }) => void;
  nowStr: string;
  fetchLogs: (range: TimeRange, initial: boolean) => void;
  isMobile: boolean;
  logRetentionDays: number;
}

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  range,
  setRange,
  customRange,
  setCustomRange,
  nowStr,
  fetchLogs,
  isMobile,
  logRetentionDays,
}) => {
  const { t } = useTranslation();

  const RANGE_PRESETS = [
    { key: "10m", days: 0.007 },
    { key: "1h", days: 0.0416 },
    { key: "24h", days: 1 },
    { key: "7d", days: 7 },
    { key: "30d", days: 30 },
  ];
  const visibleRanges = RANGE_PRESETS.filter(r => r.days <= logRetentionDays).map(r => r.key as TimeRange);

  return (
    <div className="overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
      <ButtonGroup minimal={isMobile} variant={isMobile ? undefined : "minimal"}>
        {visibleRanges.map((r) => (
          <Button key={r} active={range === r} onClick={() => setRange(r)} text={r.toUpperCase()} small={isMobile} />
        ))}
        <PopoverNext
          content={
            <div className="p-4 space-y-2 w-64">
              <H5>{t("analytics.customRange")}</H5>
              <FormGroup label={t("analytics.startTime")}>
                <InputGroup
                  type="datetime-local"
                  max={customRange.end || nowStr}
                  value={customRange.start}
                  onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                />
              </FormGroup>
              <FormGroup label={t("analytics.endTime")}>
                <InputGroup
                  type="datetime-local"
                  min={customRange.start}
                  max={nowStr}
                  value={customRange.end}
                  onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
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
          <Button active={range === "custom"} icon={<Calendar size={14} />} text={isMobile ? "" : t("analytics.custom")} small={isMobile} />
        </PopoverNext>
      </ButtonGroup>
    </div>
  );
};
