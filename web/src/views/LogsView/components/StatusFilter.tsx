import React from "react";
import { PopoverNext, Button, Menu, MenuItem, MenuDivider, Intent } from "@blueprintjs/core";
import { Filter } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface StatusFilterProps {
  statusFilter: string | null;
  setStatusFilter: (val: string | null) => void;
  isMobile: boolean;
}

export const StatusFilter: React.FC<StatusFilterProps> = ({
  statusFilter,
  setStatusFilter,
  isMobile,
}) => {
  const { t } = useTranslation();

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

  return (
    <PopoverNext content={filterMenu} placement="bottom-start">
      <Button
        icon={<Filter size={14} />}
        rightIcon="caret-down"
        intent={currentFilter.intent}
        text={currentFilter.text}
        variant="outlined"
        fill={isMobile}
      />
    </PopoverNext>
  );
};
