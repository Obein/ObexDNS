import React from "react";
import {
  PopoverNext,
  Button,
  Menu,
  MenuItem,
  MenuDivider,
  Intent,
} from "@blueprintjs/core";
import { Network } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface IspFilterProps {
  ispFilter: string | null;
  setIspFilter: (val: string | null) => void;
  isps: { name: string; count: number }[];
  isMobile: boolean;
}

export const IspFilter: React.FC<IspFilterProps> = ({
  ispFilter,
  setIspFilter,
  isps,
  isMobile,
}) => {
  const { t } = useTranslation();

  const ispMenu = (
    <Menu className="max-h-64 overflow-y-auto">
      <MenuItem
        icon={ispFilter === null ? "tick" : undefined}
        text={t("logs.allIsp") + " (" + t("logs.timeRange", "Time Range") + ")"}
        onClick={() => setIspFilter(null)}
      />
      <MenuDivider />
      {isps.map((isp) => (
        <MenuItem
          key={isp.name}
          icon={ispFilter === isp.name ? "tick" : undefined}
          text={`${isp.name} (${isp.count.toLocaleString()})`}
          onClick={() => setIspFilter(isp.name)}
        />
      ))}
    </Menu>
  );

  const selectedIspName = ispFilter || t("logs.allIsp");

  return (
    <PopoverNext content={ispMenu} placement="bottom-start">
      <Button
        icon={<Network size={14} />}
        rightIcon="caret-down"
        intent={ispFilter ? Intent.PRIMARY : Intent.NONE}
        text={selectedIspName}
        variant="outlined"
        fill={isMobile}
      />
    </PopoverNext>
  );
};
