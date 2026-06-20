import React from "react";
import { PopoverNext, Button, Menu, MenuItem, MenuDivider, Intent } from "@blueprintjs/core";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getFlagEmoji } from "../../../utils/getFlagEmoji";
import { formatCountryName } from "../../../utils/formatCountryName";

export interface DestCountryFilterProps {
  destCountryFilter: string | null;
  setDestCountryFilter: (val: string | null) => void;
  countries: { country_code: string; country: string }[];
  isMobile: boolean;
}

export const DestCountryFilter: React.FC<DestCountryFilterProps> = ({
  destCountryFilter,
  setDestCountryFilter,
  countries,
  isMobile,
}) => {
  const { t, i18n } = useTranslation();

  const countryMenu = (
    <Menu className="max-h-64 overflow-y-auto">
      <MenuItem
        icon={destCountryFilter === null ? "tick" : undefined}
        text={t("logs.allCountry")}
        onClick={() => setDestCountryFilter(null)}
      />
      <MenuDivider />
      {countries.map((c) => (
        <MenuItem
          key={c.country_code}
          icon={destCountryFilter === c.country_code ? "tick" : undefined}
          text={`${getFlagEmoji(c.country_code)} ${formatCountryName(c.country_code, i18n.language) || c.country}`}
          onClick={() => setDestCountryFilter(c.country_code)}
        />
      ))}
    </Menu>
  );

  const selectedCountryName = destCountryFilter
    ? (formatCountryName(destCountryFilter, i18n.language) || countries.find((c) => c.country_code === destCountryFilter)?.country || destCountryFilter)
    : t("logs.allCountry");

  return (
    <PopoverNext content={countryMenu} placement="bottom-start">
      <Button
        icon={<Globe size={14} />}
        rightIcon="caret-down"
        intent={destCountryFilter ? Intent.PRIMARY : Intent.NONE}
        text={selectedCountryName}
        variant="outlined"
        fill={isMobile}
      />
    </PopoverNext>
  );
};
