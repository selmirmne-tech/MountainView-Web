import { smjenaRef } from "../firebase/refs";
import { set } from "firebase/database";

const STORAGE_KEY = "restoran_smjena_config";

export const NACIN_AUTOMATSKI = "automatski";
export const NACIN_PRVA = "prva";
export const NACIN_DRUGA = "druga";

export const DEFAULT_OD = "05:00";
export const DEFAULT_DO = "15:00";

export const getSmjenaConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        nacin: parsed.nacin || NACIN_AUTOMATSKI,
        prvaOd: parsed.prvaOd || DEFAULT_OD,
        prvaDo: parsed.prvaDo || DEFAULT_DO,
        updatedAt: Number(parsed.updatedAt) || 0,
        updatedBy: parsed.updatedBy || "",
      };
    }
  } catch (_) {}
  return {
    nacin: NACIN_AUTOMATSKI,
    prvaOd: DEFAULT_OD,
    prvaDo: DEFAULT_DO,
    updatedAt: 0,
    updatedBy: "",
  };
};

export const saveSmjenaConfigLocal = (config) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (_) {}
};

export const syncSmjenaFromSnapshot = (snapshot) => {
  if (!snapshot || !snapshot.exists()) return false;
  const val = snapshot.val() || {};
  const remoteUpdatedAt = Number(val.updatedAt) || 0;
  const local = getSmjenaConfig();
  if (remoteUpdatedAt > local.updatedAt || local.updatedAt === 0) {
    const fresh = {
      nacin: val.nacin || NACIN_AUTOMATSKI,
      prvaOd: val.prvaOd || DEFAULT_OD,
      prvaDo: val.prvaDo || DEFAULT_DO,
      updatedAt: remoteUpdatedAt,
      updatedBy: val.updatedBy || "",
    };
    saveSmjenaConfigLocal(fresh);
    return true;
  }
  return false;
};

export const saveSmjenaToFirebase = async (nacin, prvaOd, prvaDo, updatedBy = "") => {
  const now = Date.now();
  const fresh = {
    nacin: nacin || NACIN_AUTOMATSKI,
    prvaOd: prvaOd || DEFAULT_OD,
    prvaDo: prvaDo || DEFAULT_DO,
    updatedAt: now,
    updatedBy: updatedBy || "",
  };
  saveSmjenaConfigLocal(fresh);
  await set(smjenaRef(), fresh);
  return fresh;
};

export const parseMinutes = (timeStr, defaultMinutes) => {
  if (!timeStr) return defaultMinutes;
  const parts = String(timeStr).trim().split(":");
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
  }
  return defaultMinutes;
};

export const isFirstShift = (date = new Date(), customConfig = null) => {
  const cfg = customConfig || getSmjenaConfig();
  if (cfg.nacin === NACIN_PRVA) return true;
  if (cfg.nacin === NACIN_DRUGA) return false;

  const d = date instanceof Date ? date : new Date(date);
  const currentMinutes = d.getHours() * 60 + d.getMinutes();
  const startMinutes = parseMinutes(cfg.prvaOd, 5 * 60);
  const endMinutes = parseMinutes(cfg.prvaDo, 15 * 60);

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
};

export const getActiveShiftName = (date = new Date(), customConfig = null) => {
  return isFirstShift(date, customConfig) ? "Prva smjena" : "Druga smjena";
};

export const formatLastChanged = (millis) => {
  if (!millis || millis <= 0) return "";
  const d = new Date(millis);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
