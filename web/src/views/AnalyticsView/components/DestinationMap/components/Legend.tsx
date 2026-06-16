import React from "react";
import { useTranslation } from "react-i18next";

interface LegendProps {
  maxThreshold: number;
  formatNumber: (num: number) => string;
}

export const Legend: React.FC<LegendProps> = ({ maxThreshold, formatNumber }) => {
  const { t } = useTranslation();
  return (
    <div className="sm:absolute sm:bottom-3 sm:left-3 relative m-3 sm:m-0 flex flex-col shrink-0 gap-1.5 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md p-2 rounded-lg border border-gray-200/50 dark:border-slate-800/50 shadow-sm z-10 max-w-70">
      <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("analytics.queries")}</span>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={i}
            className="w-4 h-2.5 rounded-sm border border-black/5 dark:border-white/5"
            style={{ backgroundColor: `var(--map-color-${i})` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-gray-500 dark:text-gray-400 font-semibold px-0.5">
        <span>0</span>
        <span>{formatNumber(maxThreshold / 2)}</span>
        <span>{formatNumber(maxThreshold)}+</span>
      </div>
    </div>
  );
};
