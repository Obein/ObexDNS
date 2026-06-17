import i18n from "../i18n/config";
import { setSystemLocale } from "./date";

/**
 * Updates the application locale and persists the change to the user account if logged in.
 *
 * @param newLocale - The new locale code to set.
 * @returns A promise resolving to a boolean indicating if the API update succeeded.
 */
export async function updateLocale(newLocale: string): Promise<boolean> {
  const locale = newLocale || "en-US";
  
  // Instantly update local application states for responsive UI feedback
  i18n.changeLanguage(locale);
  setSystemLocale(locale);

  try {
    const res = await fetch("/api/account/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale })
    });
    return res.ok;
  } catch (e) {
    console.error("Failed to persist locale to server:", e);
    return false;
  }
}
