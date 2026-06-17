import React from "react";
import { PopoverNext, Button, Menu, MenuItem, MenuDivider, Intent } from "@blueprintjs/core";
import { MonitorSmartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AccessPoint } from "../../../types/auth";

export interface AccessPointFilterProps {
  accessPointIdFilter: string | null;
  setAccessPointIdFilter: (val: string | null) => void;
  accessPoints: AccessPoint[];
  isMobile: boolean;
}

export const AccessPointFilter: React.FC<AccessPointFilterProps> = ({
  accessPointIdFilter,
  setAccessPointIdFilter,
  accessPoints,
  isMobile,
}) => {
  const { t } = useTranslation();

  const apMenu = (
    <Menu>
      <MenuItem
        icon={accessPointIdFilter === null ? "tick" : undefined}
        text={t("logs.allAccessPoint")}
        onClick={() => setAccessPointIdFilter(null)}
      />
      <MenuDivider />
      {accessPoints.map(ap => (
        <MenuItem
          key={ap.id}
          icon={accessPointIdFilter === ap.id ? "tick" : undefined}
          text={ap.name}
          onClick={() => setAccessPointIdFilter(ap.id)}
        />
      ))}
    </Menu>
  );

  const selectedApName = accessPointIdFilter 
    ? (accessPoints.find(ap => ap.id === accessPointIdFilter)?.name || t("logs.allAccessPoint"))
    : t("logs.allAccessPoint");

  return (
    <PopoverNext content={apMenu} placement="bottom-start">
      <Button
        icon={<MonitorSmartphone size={14} />}
        rightIcon="caret-down"
        intent={accessPointIdFilter ? Intent.PRIMARY : Intent.NONE}
        text={selectedApName}
        variant="outlined"
        fill={isMobile}
      />
    </PopoverNext>
  );
};
