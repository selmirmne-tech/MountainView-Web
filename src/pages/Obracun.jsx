import { useEffect, useMemo, useRef, useState } from "react";
import { child, get, onValue, runTransaction, update } from "firebase/database";
import { artikliRestoran, formaRestoran, globalLockPath, globalLockRef, menuDrinkItem, menuDrinkItems, menuDrinkStockPath, obracunRestoran, rootRestoran, usersRestoran } from "../firebase/refs";
import { sentenceCase } from "./animationText";
import * as N from "../firebase/nodes";

const pageStyle = {
  width: "100%", minHeight: "100vh", boxSizing: "border-box", padding: "18px clamp(8px, 1.2vw, 18px) 40px",
  background: "#f8fafc", color: "#0f172a", fontFamily: "Inter,system-ui,sans-serif",
};
const panelStyle = {
  background: "white", border: "1px solid #e2e8f0", borderRadius: 16,
  padding: "clamp(12px, 1.4vw, 20px)", boxShadow: "0 4px 18px rgba(15,23,42,0.04)",
};
const buttonStyle = {
  border: "1px solid #cbd5e1", borderRadius: 10, padding: "9px 14px", background: "white",
  color: "#1e293b", fontWeight: 700, cursor: "pointer", font: "inherit", display: "inline-flex",
  alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s ease",
};
const inputStyle = {
  width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 9,
  padding: "9px 10px", font: "inherit", color: "#0f172a", background: "white",
};
const headerCell = { padding: "12px 10px", background: "#176b55", color: "white", textAlign: "left", whiteSpace: "nowrap", fontSize: 13, fontWeight: 700 };
const cell = { padding: "11px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "left", verticalAlign: "middle", fontSize: 13 };
const entryCell = { ...cell, padding: "7px 5px", fontSize: 12, overflowWrap: "anywhere" };

const objectValue = (value) => {
  if (Array.isArray(value)) return Object.fromEntries(value.map((item, index) => [String(index), item]).filter(([, item]) => item != null));
  return value && typeof value === "object" ? value : {};
};
const withTimeout = (promise, ms, label = "Operacija") => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${label} je prekinuta zbog prekoračenja vremena (${ms / 1000}s). Provjerite internet konekciju.`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
};
const number = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const parseCents = (value) => {
  const text = String(value ?? "").trim().replace(",", ".");
  const match = text.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const fraction = match[3] || "";
  let cents = Number(match[2]) * 100 + Number((fraction + "00").slice(0, 2));
  if (fraction.length > 2 && fraction[2] >= "5") cents++;
  return sign * cents;
};
const euros = (cents) => (Number(cents || 0) / 100).toFixed(2);
const money = (value) => euros(parseCents(value) ?? 0);
const formatQuantity = (value) => Number.isInteger(number(value)) ? String(number(value)) : String(number(value));
const dateOrder = (key) => {
  const match = String(key).match(/^(\d{1,2})_(\d{1,2})_(\d{4})$/);
  return match ? `${match[3]}${match[2].padStart(2, "0")}${match[1].padStart(2, "0")}` : key;
};
const displayDate = (key) => String(key || "").replaceAll("_", ".");
const displayTime = (key) => String(key || "").replaceAll("-", ":");
const currentKeys = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${pad(now.getDate())}_${pad(now.getMonth() + 1)}_${now.getFullYear()}`,
    time: `${pad(now.getHours())}-${pad(now.getMinutes())}`,
    dateFormatted: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`,
    timeFormatted: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    dateIsoKey: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
};
const currentPdfDateTime = () => {
  const now = new Date(); const pad = (value) => String(value).padStart(2, "0");
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
};
const cleanItems = (value) => Object.entries(objectValue(value)).map(([id, item]) => ({
  id,
  naziv: String(item?.naziv ?? ""),
  jedinica_mjere: String(item?.jedinica_mjere ?? ""),
  stanje_prethodno: number(item?.stanje_prethodno ?? item?.ostalo),
  ubaceno: number(item?.ubaceno),
  ukupno: number(item?.ukupno ?? item?.ostalo),
  kolicina: number(item?.kolicina),
  cijena: item?.cijena ?? 0,
  vrijednost: item?.vrijednost ?? 0,
  novo: number(item?.ostalo ?? item?.novo),
  ostalo: number(item?.ostalo ?? item?.novo),
  datum_unosa: String(item?.datum_unosa ?? ""),
}));

function downloadBeverageStockPdf(items, title = "Stanje artikala", customDateTime = null, fileName = "Stanje_artikala") {
  const rows = items.map((item, idx) => ({
    id: item.id || String(idx + 1),
    name: String(item.name || item.naziv || ""),
    stock: number(item.stock ?? item.novo ?? item.ostalo ?? 0)
  }));
  const pageW = 1190; const pageH = 1684;
  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const dateStr = customDateTime?.date || `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
  const timeStr = customDateTime?.time || `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const labels = ["#", "Ime artikla", "Stanje"];
  const widths = [60, 750, 260];
  const pages = [];

  const makePage = (numberOfPage) => {
    const canvas = document.createElement("canvas"); canvas.width = pageW; canvas.height = pageH;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, pageW, pageH);
    ctx.fillStyle = "#0f172a"; ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.font = "bold 36px Arial";
    ctx.fillText(title, pageW / 2, 55);
    ctx.textAlign = "left"; ctx.font = "bold 22px Arial"; ctx.fillText(dateStr, 60, 105);
    ctx.font = "20px Arial"; ctx.fillText(timeStr, 60, 135);
    ctx.textAlign = "right"; ctx.font = "16px Arial"; ctx.fillStyle = "#64748b";
    ctx.fillText(`Strana ${numberOfPage}`, pageW - 60, pageH - 35);
    const rect = (x, y, w, h, fill = "#f8fafc") => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h); };
    let x = 60; const headerY = 175; const headerH = 48;
    ctx.font = "bold 20px Arial";
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = "#176b55"; ctx.fillRect(x, headerY, widths[i], headerH);
      ctx.strokeStyle = "#125442"; ctx.strokeRect(x, headerY, widths[i], headerH);
      ctx.fillStyle = "white"; ctx.textAlign = i === 1 ? "left" : "center";
      const tx = i === 1 ? x + 18 : x + widths[i] / 2;
      ctx.fillText(labels[i], tx, headerY + headerH / 2, widths[i] - 24);
      x += widths[i];
    }
    return { canvas, ctx, rect, y: headerY + headerH };
  };

  const drawRow = (p, item, index) => {
    let x = 60; const rowH = 38;
    const isOdd = index % 2 === 1; const bg = isOdd ? "#f8fafc" : "#ffffff";
    const values = [String(index + 1), item.name, String(Math.round(item.stock))];
    p.ctx.font = "17px Arial";
    values.forEach((val, col) => {
      p.rect(x, p.y, widths[col], rowH, bg);
      p.ctx.fillStyle = col === 2 && Number(val) < 6 ? "#d32f2f" : "#1e293b";
      p.ctx.font = col === 2 ? "bold 17px Arial" : "17px Arial";
      p.ctx.textAlign = col === 1 ? "left" : "center";
      const tx = col === 1 ? x + 18 : x + widths[col] / 2;
      p.ctx.fillText(val, tx, p.y + rowH / 2, widths[col] - 24);
      x += widths[col];
    });
    p.y += rowH;
  };

  let page = makePage(1); pages.push(page);
  if (rows.length) {
    rows.forEach((item, index) => {
      if (page.y + 36 > pageH - 70) { page = makePage(pages.length + 1); pages.push(page); }
      drawRow(page, item, index);
    });
  } else {
    page.ctx.textAlign = "center"; page.ctx.font = "18px Arial"; page.ctx.fillStyle = "#64748b";
    page.ctx.fillText("Nema stavki.", pageW / 2, page.y + 30);
  }

  const enc = new TextEncoder();
  const join = (parts) => { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let at = 0; parts.forEach((part) => { out.set(part, at); at += part.length; }); return out; };
  const objects = []; objects[1] = enc.encode("<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds = pages.map((_, index) => 3 + index * 3);
  objects[2] = enc.encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  pages.forEach((entry, index) => {
    const pageId = 3 + index * 3; const imageId = pageId + 1; const contentId = pageId + 2;
    const raw = atob(entry.canvas.toDataURL("image/jpeg", .92).split(",")[1]); const image = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    objects[pageId] = enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects[imageId] = join([enc.encode(`<< /Type /XObject /Subtype /Image /Width ${pageW} /Height ${pageH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, enc.encode("\nendstream")]);
    const content = enc.encode("q 595 0 0 842 0 0 cm /Im0 Do Q"); objects[contentId] = join([enc.encode(`<< /Length ${content.length} >>\nstream\n`), content, enc.encode("\nendstream")]);
  });
  const chunks = [enc.encode("%PDF-1.4\n")]; const offsets = [0]; let length = chunks[0].length;
  for (let id = 1; id < objects.length; id++) { offsets[id] = length; const obj = join([enc.encode(`${id} 0 obj\n`), objects[id], enc.encode("\nendobj\n")]); chunks.push(obj); length += obj.length; }
  const xref = [`xref\n0 ${objects.length}\n`, "0000000000 65535 f \n", ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`), `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`];
  chunks.push(enc.encode(xref.join("")));
  const url = URL.createObjectURL(new Blob([join(chunks)], { type: "application/pdf" })); const link = document.createElement("a");
  link.href = url; link.download = `${fileName}_${dateStr.replace(/\./g, "_")}_${timeStr.replace(/:/g, "-")}.pdf`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadPdfFile(title, dateTime, items, report, fileName = title, savedByName = "") {
  let rows = Array.isArray(items) ? items : cleanItems(items);
  if (!rows.length && report?.artikli) rows = cleanItems(report.artikli);
  const pageW = 1684; const pageH = 1190;
  const labels = ["#", "Naziv", "Jedinica", "Stanje prethodno", "Novo stanje", "Ubačeno", "Ukupno", "Količina", "Cijena", "Vrijednost", "Ostalo"];
  const base = [42, 230, 76, 145, 106, 82, 82, 82, 82, 112, 76];
  const scale = (pageW - 80) / base.reduce((sum, value) => sum + value, 0);
  const widths = base.map((value) => value * scale);
  const groups = report ? [
    ["Prihodi", [["Obračun pića", report.ukupno], ["Kuhinja", report.kuhinja], ["Ukupno", report.zbir]]],
    ["Rashod", [["Dnevnice", report.dnevnice], ["Osoblje", report.osoblje], ["Kuća", report.kuca], ["Zbir", report.rashod]]],
    ["Zarada", [["Zarada", report.zarada]]],
    ["Smjena / Konobari", [["Smjena", report.smjena], ["Konobari", report.konobari]]],
  ] : [];
  const pages = [];
  const makePage = (numberOfPage) => {
    const canvas = document.createElement("canvas"); canvas.width = pageW; canvas.height = pageH;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, pageW, pageH);
    ctx.fillStyle = "#17231f"; ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.font = "bold 34px Arial"; ctx.fillText(title, pageW / 2, 48);
    ctx.textAlign = "left"; ctx.font = "20px Arial"; ctx.fillText(dateTime, 42, 91);
    if (report && savedByName && numberOfPage === 1) {
      ctx.textAlign = "left"; ctx.fillStyle = "#17231f"; ctx.font = "bold 22px Arial";
      ctx.fillText(`Sačuvao: ${savedByName}`, 42, 112);
    }
    ctx.textAlign = "right"; ctx.fillText(`Strana ${numberOfPage}`, pageW - 42, pageH - 28);
    const rect = (x, y, w, h, fill = "#e8f4ef") => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "#9eada5"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h); };
    const page = { canvas, ctx, rect, y: 194 };
    ctx.textAlign = "center"; ctx.font = "bold 16px Arial"; ctx.fillStyle = "#20362f";
    let x = 40;
    const headerH = 72;
    for (let i = 0; i < 7; i++) {
      rect(x, 122, widths[i], headerH);
      ctx.fillStyle = "#20362f";
      ctx.textAlign = i === 1 ? "left" : "center";
      ctx.fillText(labels[i], i === 1 ? x + 10 : x + widths[i] / 2, 122 + headerH / 2, widths[i] - 12);
      x += widths[i];
    }
    const soldW = widths[7] + widths[8] + widths[9];
    const soldTopH = 30;
    const soldSubH = headerH - soldTopH;
    rect(x, 122, soldW, soldTopH);
    ctx.fillStyle = "#20362f";
    ctx.fillText("PRODATO", x + soldW / 2, 122 + soldTopH / 2);
    let sx = x;
    for (let i = 7; i <= 9; i++) {
      rect(sx, 122 + soldTopH, widths[i], soldSubH);
      ctx.fillStyle = "#20362f";
      ctx.fillText(labels[i], sx + widths[i] / 2, 122 + soldTopH + soldSubH / 2, widths[i] - 8);
      sx += widths[i];
    }
    rect(x + soldW, 122, widths[10], headerH);
    ctx.fillStyle = "#20362f";
    ctx.fillText(labels[10], x + soldW + widths[10] / 2, 122 + headerH / 2, widths[10] - 8);
    return page;
  };
  const drawRow = (page, item, index) => {
    const ostaloWhole = String(Math.round(number(item.ostalo)));
    const values = [index + 1, item.naziv, item.jedinica_mjere, formatQuantity(item.stanje_prethodno), formatQuantity(item.novo), formatQuantity(item.ubaceno), formatQuantity(item.ukupno), formatQuantity(item.kolicina), `${money(item.cijena)} €`, `${money(item.vrijednost)} €`, ostaloWhole];
    let x = 40; page.ctx.font = "16px Arial"; page.ctx.textAlign = "center"; page.ctx.fillStyle = "#25364a";
    values.forEach((value, column) => { page.rect(x, page.y, widths[column], 31, index % 2 ? "#f5f8f7" : "#fff"); page.ctx.fillStyle = "#25364a"; page.ctx.textAlign = column === 1 ? "left" : "center"; page.ctx.fillText(String(value ?? ""), column === 1 ? x + 10 : x + widths[column] / 2, page.y + 16, widths[column] - 16); x += widths[column]; });
    page.y += 31;
  };
  let page = makePage(1); pages.push(page);
  if (rows.length) {
    rows.forEach((item, index) => { if (page.y + 31 > 1010) { page = makePage(pages.length + 1); pages.push(page); } drawRow(page, item, index); });
  } else {
    page.ctx.textAlign = "center"; page.ctx.font = "18px Arial"; page.ctx.fillStyle = "#687974";
    page.ctx.fillText("Nema stavki u ovom obračunu.", pageW / 2, page.y + 20);
    page.y += 40;
  }
  if (report) {
    let y = page.y + 28;
    if (y + 250 > 1105) { page = makePage(pages.length + 1); pages.push(page); y = page.y + 18; }
    page.ctx.textAlign = "left"; page.ctx.fillStyle = "#17231f"; page.ctx.font = "bold 24px Arial"; page.ctx.fillText("Podaci obračuna", 42, y); y += 22;
    const groupWidths = [390, 390, 300, 510]; const maxRows = Math.max(...groups.map(([, rows]) => rows.length)); const groupH = 44 + maxRows * 36;
    let x = 40;
    groups.forEach(([heading, rows], group) => {
      const w = groupWidths[group]; page.ctx.fillStyle = "#176b55"; page.ctx.fillRect(x, y, w, 44); page.ctx.strokeStyle = "#9eada5"; page.ctx.strokeRect(x, y, w, groupH);
      page.ctx.fillStyle = "white"; page.ctx.font = "bold 18px Arial"; page.ctx.textAlign = "center"; page.ctx.fillText(heading, x + w / 2, y + 22, w - 16);
      rows.forEach(([label, value], row) => { const ry = y + 44 + row * 36; page.ctx.fillStyle = row % 2 ? "#f7faf8" : "white"; page.ctx.fillRect(x, ry, w, 36); page.ctx.strokeStyle = "#d0d9d4"; page.ctx.strokeRect(x, ry, w, 36); page.ctx.fillStyle = "#25364a"; page.ctx.textAlign = "left"; page.ctx.font = "16px Arial"; page.ctx.fillText(`${label}:`, x + 10, ry + 18, w * .56); page.ctx.font = "bold 16px Arial"; page.ctx.fillText(typeof value === "number" ? money(value) : String(value ?? ""), x + w * .43, ry + 18, w * .55 - 10); });
      x += w + 12;
    });
  }
  const enc = new TextEncoder();
  const join = (parts) => { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let at = 0; parts.forEach((part) => { out.set(part, at); at += part.length; }); return out; };
  const objects = []; objects[1] = enc.encode("<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds = pages.map((_, index) => 3 + index * 3);
  objects[2] = enc.encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  pages.forEach((entry, index) => {
    const pageId = 3 + index * 3; const imageId = pageId + 1; const contentId = pageId + 2;
    const raw = atob(entry.canvas.toDataURL("image/jpeg", .92).split(",")[1]); const image = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    objects[pageId] = enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects[imageId] = join([enc.encode(`<< /Type /XObject /Subtype /Image /Width ${pageW} /Height ${pageH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, enc.encode("\nendstream")]);
    const content = enc.encode("q 842 0 0 595 0 0 cm /Im0 Do Q"); objects[contentId] = join([enc.encode(`<< /Length ${content.length} >>\nstream\n`), content, enc.encode("\nendstream")]);
  });
  const chunks = [enc.encode("%PDF-1.4\n")]; const offsets = [0]; let length = chunks[0].length;
  for (let id = 1; id < objects.length; id++) { offsets[id] = length; const obj = join([enc.encode(`${id} 0 obj\n`), objects[id], enc.encode("\nendobj\n")]); chunks.push(obj); length += obj.length; }
  const xref = [`xref\n0 ${objects.length}\n`, "0000000000 65535 f \n", ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`), `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`];
  chunks.push(enc.encode(xref.join("")));
  const url = URL.createObjectURL(new Blob([join(chunks)], { type: "application/pdf" })); const link = document.createElement("a");
  link.href = url; link.download = `${fileName}_${dateTime}`.replace(/[^a-zA-Z0-9._-]+/g, "_") + ".pdf"; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Obracun() {
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  }, []);
  const role = user?.titula || "";
  const isAdmin = role === "Administrator";
  const canReport = isAdmin || role === "Konobar";
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState({});
  const [dailyObracunHistory, setDailyObracunHistory] = useState({});
  const [selectedDailyDate, setSelectedDailyDate] = useState("");
  const [usersById, setUsersById] = useState({});
  const [sold, setSold] = useState({});
  const [added, setAdded] = useState({});
  const soldInputsRef = useRef([]);
  const additionalFieldsRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fields, setFields] = useState({ kuhinja: "0", dnevnice: "0", osoblje: "0", kuca: "0", smjena: "", konobari: "" });
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [pendingLatestReport, setPendingLatestReport] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [dialogError, setDialogError] = useState("");
  const [form, setForm] = useState({ naziv: "", jedinica_mjere: "", stanje_prethodno: "", ubaceno: "", kolicina: "", cijena: "" });
  const [showSuccess, setShowSuccess] = useState(false);
  const [successText, setSuccessText] = useState("");

  // Stock items & operations
  const [menuStockItems, setMenuStockItems] = useState([]);
  const [menuStockInputs, setMenuStockInputs] = useState({});
  const [menuStockEditInputs, setMenuStockEditInputs] = useState({});
  const [stockBusyId, setStockBusyId] = useState("");
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockDialogConfirm, setStockDialogConfirm] = useState(false);
  const [stockDialogError, setStockDialogError] = useState("");
  const [stockEditDialogOpen, setStockEditDialogOpen] = useState(false);
  const [stockEditConfirm, setStockEditConfirm] = useState(false);
  const [stockEditError, setStockEditError] = useState("");
  const [stockWorking, setStockWorking] = useState(false);
  const [stockStage, setStockStage] = useState("");
  const [showDailyHistory, setShowDailyHistory] = useState(true);
  const firstStockInputRef = useRef(null);
  const firstStockEditInputRef = useRef(null);

  const showSuccessAnimation = (text) => {
    setSuccessText(text);
    setShowSuccess(true);
    window.setTimeout(() => setShowSuccess(false), 2000);
  };

  useEffect(() => {
    if (stockDialogOpen && !stockDialogConfirm) {
      const timer = window.setTimeout(() => {
        if (firstStockInputRef.current) {
          firstStockInputRef.current.focus();
          if (firstStockInputRef.current.value === "0") {
            setMenuStockInputs((current) => {
              const firstId = menuStockItems[0]?.id;
              return firstId ? { ...current, [firstId]: "" } : current;
            });
          } else {
            firstStockInputRef.current.select?.();
          }
        }
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [stockDialogOpen, stockDialogConfirm, menuStockItems]);

  useEffect(() => {
    if (stockEditDialogOpen && !stockEditConfirm) {
      const timer = window.setTimeout(() => {
        if (firstStockEditInputRef.current) {
          firstStockEditInputRef.current.focus();
          firstStockEditInputRef.current.select?.();
        }
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [stockEditDialogOpen, stockEditConfirm, menuStockItems]);

  useEffect(() => {
    const offItems = onValue(artikliRestoran(), (snapshot) => {
      const fresh = cleanItems(snapshot.val());
      setItems(fresh);
      setSold((current) => Object.fromEntries(fresh.map((item) => [item.id, current[item.id] ?? "0"])));
      setAdded((current) => Object.fromEntries(fresh.map((item) => [item.id, current[item.id] ?? "0"])));
      setLoading(false);
    }, (firebaseError) => { setError(`Ne mogu učitati artikle: ${firebaseError.message}`); setLoading(false); });

    const offHistory = isAdmin
      ? onValue(formaRestoran(), (snapshot) => setHistory(objectValue(snapshot.val())), (firebaseError) => setError(`Ne mogu učitati istoriju: ${firebaseError.message}`))
      : () => {};

    const offDailyObracun = isAdmin
      ? onValue(obracunRestoran(), (snapshot) => {
          const val = objectValue(snapshot.val());
          setDailyObracunHistory(val);
          const keys = Object.keys(val).sort((a, b) => b.localeCompare(a));
          if (keys.length && !selectedDailyDate) setSelectedDailyDate(keys[0]);
        }, (firebaseError) => console.warn("OBRACUN_LOAD_ERROR", firebaseError))
      : () => {};

    const offUsers = isAdmin
      ? onValue(usersRestoran(), (snapshot) => {
          const users = {};
          snapshot.forEach((childSnapshot) => {
            const record = objectValue(childSnapshot.val());
            users[childSnapshot.key] = String(record.ime || record.name || record.fullname || record.email || "");
          });
          setUsersById(users);
        }, (firebaseError) => setError(`Ne mogu učitati imena korisnika: ${firebaseError.message}`))
      : () => {};

    const offMenuStock = isAdmin
      ? onValue(menuDrinkItems(), (snapshot) => {
          const rows = [];
          snapshot.forEach((itemSnapshot) => {
            const item = objectValue(itemSnapshot.val());
            const price = number(item.price || item.cijena || 0);
            rows.push({ id: itemSnapshot.key, name: String(item.name || itemSnapshot.key), stock: number(item[N.MENU_STANJE]), price });
          });
          rows.sort((a, b) => /^d+$/.test(a.id) && /^d+$/.test(b.id)
            ? Number(a.id) - Number(b.id) : a.id.localeCompare(b.id));
          setMenuStockItems(rows);
          setMenuStockInputs((current) => Object.fromEntries(rows.map((item) => [item.id, current[item.id] ?? "0"])));
          setMenuStockEditInputs((current) => Object.fromEntries(rows.map((item) => [item.id, current[item.id] ?? String(item.stock)])));
        }, (firebaseError) => setError(`Ne mogu učitati stanje menija pića: ${firebaseError.message}`))
      : () => {};

    return () => { offItems(); offHistory(); offDailyObracun(); offUsers(); offMenuStock(); };
  }, [isAdmin]);

  // Record daily snapshot if today is not recorded yet, and purge older than 30 days
  const recordDailySnapshotIfNeeded = async (currentDrinkSnapshots, updatesMap) => {
    try {
      const { dateIsoKey, dateFormatted, timeFormatted } = currentKeys();
      const todayRef = child(obracunRestoran(), dateIsoKey);
      const todaySnap = await withTimeout(get(todayRef), 6000, "Provjera dnevnog obračuna");
      if (!todaySnap.exists()) {
        const obracunPath = `${N.ROOT_RESTORAN}/${N.OBRACUN}/${dateIsoKey}`;
        updatesMap[`${obracunPath}/datum`] = dateFormatted;
        updatesMap[`${obracunPath}/vrijeme`] = timeFormatted;
        updatesMap[`${obracunPath}/timestamp`] = Date.now();
        updatesMap[`${obracunPath}/sacuvao`] = user?.ime || user?.name || "Sistem";

        // Auto-purge older than 30 days
        const allObracunSnap = await withTimeout(get(obracunRestoran()), 6000, "Učitavanje starih obračuna");
        if (allObracunSnap.exists()) {
          const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
          allObracunSnap.forEach((childSnap) => {
            const ts = Number(childSnap.child("timestamp").val()) || 0;
            if (ts > 0 && ts < thirtyDaysAgo) {
              updatesMap[`${N.ROOT_RESTORAN}/${N.OBRACUN}/${childSnap.key}`] = null;
            }
          });
        }
      }
    } catch (e) {
      console.warn("DAILY_SNAPSHOT_PREP_FAILED", e);
    }
  };

  const requestMenuStockAdd = () => {
    const quantities = Object.entries(menuStockInputs)
      .map(([itemId, raw]) => ({ itemId, raw: String(raw ?? "").trim(), amount: Number(String(raw ?? "").trim().replace(",", ".")) }))
      .filter((item) => item.raw !== "" && item.amount !== 0);
    if (quantities.some((item) => !Number.isFinite(item.amount) || item.amount < 0)) {
      setStockDialogError("Unesite ispravne količine. Vrijednosti ne mogu biti negativne.");
      return;
    }
    if (!quantities.length) {
      setStockDialogError("Unesite količinu za najmanje jedan artikal.");
      return;
    }
    setStockDialogError("");
    setStockDialogConfirm(true);
  };

  const requestStockEdit = () => {
    const itemsToSet = Object.entries(menuStockEditInputs)
      .map(([itemId, raw]) => ({ itemId, raw: String(raw ?? "").trim(), targetStock: Number(String(raw ?? "").trim().replace(",", ".")) }))
      .filter((item) => item.raw !== "");
    if (itemsToSet.some((item) => !Number.isFinite(item.targetStock) || item.targetStock < 0)) {
      setStockEditError("Unesite ispravna nova stanja. Vrijednosti ne mogu biti negativne.");
      return;
    }
    // Check if at least one item differs from current stock
    const changed = itemsToSet.filter((item) => {
      const currentItem = menuStockItems.find((m) => m.id === item.itemId);
      return currentItem && currentItem.stock !== item.targetStock;
    });
    if (!changed.length) {
      setStockEditError("Nijedno stanje nije promijenjeno.");
      return;
    }
    setStockEditError("");
    setStockEditConfirm(true);
  };

  const executeStockUpdate = async (quantities, mode = "add") => {
    if (!quantities || !quantities.length) return;
    setStockWorking(true);
    setStockStage("Preuzimanje locka kase…");
    const lockRef = globalLockRef();
    const lockLeaseMs = 15 * 1000;
    const lockToken = `LOCK:STOCK:WEB:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
    let lockAttempted = false;
    let lockReleasedByCommit = false;

    try {
      lockAttempted = true;
      let acquired = false;

      for (let attempt = 1; attempt <= 20; attempt++) {
        setStockStage(attempt === 1 ? "Preuzimanje locka kase…" : `Čeka se oslobađanje kase (${attempt}/20)…`);

        const lockTx = await withTimeout(
          runTransaction(lockRef, (currentValue) => {
            const owner = currentValue == null ? null : String(currentValue);
            const isFree = owner == null || owner.toLowerCase() === "false";
            if (isFree) return lockToken;
            return;
          }, { applyLocally: false }),
          8000, "Preuzimanje locka"
        );

        if (lockTx.committed && lockTx.snapshot.val() === lockToken) {
          try { await update(lockRef.parent, { GlobalLockUpdatedAt: Date.now() }); } catch (_) { }
          acquired = true;
          break;
        }

        // Force-acquire if lease is expired (>15s)
        try {
          const leaseSnap = await withTimeout(get(child(lockRef.parent, "GlobalLockUpdatedAt")), 5000, "Provjera lease");
          const leaseAt = Number(leaseSnap.val()) || 0;
          if (leaseAt > 0 && Date.now() - leaseAt > lockLeaseMs) {
            console.warn("WEB_STOCK_LOCK_EXPIRED forcing acquire", { attempt, leaseAgeMs: Date.now() - leaseAt });
            await update(lockRef.parent, { [N.GLOBAL_LOCK]: lockToken, GlobalLockUpdatedAt: Date.now() });
            acquired = true;
            break;
          }
        } catch (_) { }

        if (attempt < 20) await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }

      if (!acquired) throw new Error("Kasa je zauzeta. Pokušajte ponovo za trenutak.");

      setStockStage("Čitanje stanja artikala…");
      const stockSnapshots = await Promise.all(quantities.map(async (item) => [
        item.itemId,
        await withTimeout(get(menuDrinkItem(item.itemId)), 10000, `Čitanje artikla ${item.itemId}`),
      ]));

      const updates = {};
      stockSnapshots.forEach(([itemId, snapshot]) => {
        if (!snapshot.exists()) throw new Error(`Artikal više nije u meniju: ${itemId}`);
        if (mode === "set") {
          const target = quantities.find((item) => item.itemId === itemId)?.targetStock ?? 0;
          updates[menuDrinkStockPath(itemId)] = Math.round(target * 100) / 100;
        } else {
          const currentStock = number(snapshot.child(N.MENU_STANJE).val());
          const amount = quantities.find((item) => item.itemId === itemId)?.amount || 0;
          const newStock = Math.round((currentStock + amount) * 100) / 100;
          updates[menuDrinkStockPath(itemId)] = newStock;
        }
      });

      // Check and record daily snapshot if needed (Option A)
      await recordDailySnapshotIfNeeded(stockSnapshots, updates);

      // Ažuriraj i dnevni obračun za danas tako da odmah zabilježi dodavanje / izmjenu
      try {
        const { dateIsoKey } = currentKeys();
        const obracunArtikliPath = `${N.ROOT_RESTORAN}/${N.OBRACUN}/${dateIsoKey}/artikli`;
        quantities.forEach((item) => {
          const snapshotEntry = stockSnapshots.find((s) => s[0] === item.itemId);
          const currentStock = snapshotEntry ? number(snapshotEntry[1].child(N.MENU_STANJE).val()) : 0;
          if (mode === "set") {
            const target = item.targetStock ?? 0;
            updates[`${obracunArtikliPath}/${item.itemId}/novo`] = target;
            updates[`${obracunArtikliPath}/${item.itemId}/ostalo`] = target;
            updates[`${obracunArtikliPath}/${item.itemId}/stanje`] = target;
          } else {
            const addAmount = item.amount || 0;
            const targetArtikal = dailyReport?.artikli?.[item.itemId];
            const prevNovo = targetArtikal?.novo !== undefined ? number(targetArtikal.novo) : currentStock;
            const prevUbaceno = targetArtikal?.ubaceno !== undefined ? number(targetArtikal.ubaceno) : 0;
            const prevUkupno = targetArtikal?.ukupno !== undefined ? number(targetArtikal.ukupno) : currentStock;
            const prevOstalo = targetArtikal?.ostalo !== undefined ? number(targetArtikal.ostalo) : currentStock;

            const calcNovo = Math.round((prevNovo + addAmount) * 100) / 100;
            const calcUbaceno = Math.round((prevUbaceno + addAmount) * 100) / 100;
            const calcUkupno = Math.round((prevUkupno + addAmount) * 100) / 100;
            const calcOstalo = Math.round((prevOstalo + addAmount) * 100) / 100;

            updates[`${obracunArtikliPath}/${item.itemId}/novo`] = calcNovo;
            updates[`${obracunArtikliPath}/${item.itemId}/ubaceno`] = calcUbaceno;
            updates[`${obracunArtikliPath}/${item.itemId}/ukupno`] = calcUkupno;
            updates[`${obracunArtikliPath}/${item.itemId}/ostalo`] = calcOstalo;
            updates[`${obracunArtikliPath}/${item.itemId}/stanje`] = calcNovo;
          }
        });
      } catch (err) {
        console.warn("OBRACUN_LIVE_ENTRY_UPDATE_FAILED", err);
      }

      // Atomic release of GlobalLock and clearing lease inside the same update
      updates[globalLockPath()] = "False";
      updates[`${N.ROOT_RESTORAN}/${N.TOTAL_PRICE_RESTORAN}/GlobalLockUpdatedAt`] = null;

      setStockStage("Upisivanje stanja…");
      await withTimeout(update(rootRestoran(), updates), 20000, "Upis stanja");
      lockReleasedByCommit = true;

      localStorage.removeItem("pending_stock_update_web");
      if (mode === "add") {
        setMenuStockInputs((current) => ({
          ...current,
          ...Object.fromEntries(quantities.map(({ itemId }) => [itemId, "0"])),
        }));
      }
      setStockWorking(false);
      setStockStage("");
      showSuccessAnimation(mode === "set" ? "Izmjene su sačuvane!" : "Stanje pića je uspješno ažurirano!");
    } catch (err) {
      console.error("WEB_STOCK_UPDATE_FAILED", err);
      localStorage.removeItem("pending_stock_update_web");
      if (lockAttempted && !lockReleasedByCommit) {
        try {
          await runTransaction(lockRef, (current) => {
            if (String(current) === lockToken) return "False";
            return;
          }, { applyLocally: false });
          await update(lockRef.parent, { GlobalLockUpdatedAt: null });
        } catch (releaseErr) {
          console.error("WEB_STOCK_LOCK_RELEASE_FAILED", releaseErr);
        }
      }
      setStockWorking(false);
      setStockStage("");
      setError(`Stanje nije izmijenjeno: ${err.message}`);
    }
  };

  const applyMenuStockAdd = () => {
    const quantities = Object.entries(menuStockInputs)
      .map(([itemId, raw]) => ({ itemId, raw: String(raw ?? "").trim(), amount: Number(String(raw ?? "").trim().replace(",", ".")) }))
      .filter((item) => item.raw !== "" && item.amount !== 0);
    if (!quantities.length || quantities.some((item) => !Number.isFinite(item.amount) || item.amount <= 0)) {
      setStockDialogConfirm(false);
      setStockDialogError("Unesite ispravne pozitivne količine.");
      return;
    }
    setStockDialogOpen(false);
    setStockDialogConfirm(false);
    setStockDialogError("");
    setError("");
    setNotice("");

    localStorage.setItem("pending_stock_update_web", JSON.stringify({
      quantities,
      mode: "add",
      timestamp: Date.now()
    }));

    executeStockUpdate(quantities, "add");
  };

  const applyMenuStockEdit = () => {
    const quantities = Object.entries(menuStockEditInputs)
      .map(([itemId, raw]) => ({ itemId, raw: String(raw ?? "").trim(), targetStock: Number(String(raw ?? "").trim().replace(",", ".")) }))
      .filter((item) => item.raw !== "");
    if (!quantities.length || quantities.some((item) => !Number.isFinite(item.targetStock) || item.targetStock < 0)) {
      setStockEditConfirm(false);
      setStockEditError("Unesite ispravna stanja.");
      return;
    }
    setStockEditDialogOpen(false);
    setStockEditConfirm(false);
    setStockEditError("");
    setError("");
    setNotice("");

    localStorage.setItem("pending_stock_update_web", JSON.stringify({
      quantities,
      mode: "set",
      timestamp: Date.now()
    }));

    executeStockUpdate(quantities, "set");
  };

  // Resume pending stock update if tab was closed/reloaded during in-flight update
  useEffect(() => {
    const raw = localStorage.getItem("pending_stock_update_web");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      const age = Date.now() - (saved.timestamp || 0);
      if (age > 10 * 60 * 1000) {
        localStorage.removeItem("pending_stock_update_web");
        return;
      }
      if (saved.quantities && saved.quantities.length > 0) {
        executeStockUpdate(saved.quantities, saved.mode || "add");
      } else {
        localStorage.removeItem("pending_stock_update_web");
      }
    } catch (_) {
      localStorage.removeItem("pending_stock_update_web");
    }
  }, []);

  // Prevent accidental tab closure during stock update
  useEffect(() => {
    if (!stockWorking) return;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "Ažuriranje stanja je u toku. Da li ste sigurni da želite napustiti stranicu?";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [stockWorking]);

  const dates = useMemo(() => Object.keys(history).sort((a, b) => dateOrder(b).localeCompare(dateOrder(a))), [history]);
  const times = useMemo(() => Object.keys(objectValue(history[selectedDate])).sort((a, b) => b.localeCompare(a)), [history, selectedDate]);
  useEffect(() => {
    if (!dates.length) { setSelectedDate(""); setSelectedTime(""); return; }
    if (!dates.includes(selectedDate)) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);
  useEffect(() => {
    if (!times.length) { setSelectedTime(""); return; }
    if (!times.includes(selectedTime)) setSelectedTime(times[0]);
  }, [times, selectedTime]);
  useEffect(() => {
    if (!pendingLatestReport) return;
    const savedReport = objectValue(objectValue(history[pendingLatestReport.date])[pendingLatestReport.time]);
    if (!Object.keys(savedReport).length) return;
    setSelectedDate(pendingLatestReport.date);
    setSelectedTime(pendingLatestReport.time);
    setPendingLatestReport(null);
  }, [history, pendingLatestReport]);

  const currentHistory = objectValue(objectValue(history[selectedDate])[selectedTime]);
  const historyItems = cleanItems(currentHistory.artikli);
  const savedByName = usersById[String(currentHistory.sacuvano_od_uid || "")] || "Nepoznato";
  const historyWaiterNames = String(currentHistory.konobari ?? "")
    .replace(/^Ukupna zarada od poslednjeg reseta\s*:?\s*/i, "")
    .trim();

  const advanceReportRow = (event, index) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const nextInput = soldInputsRef.current[index + 1];
    if (nextInput) nextInput.focus();
    else event.currentTarget.blur();
  };
  const advanceAdditionalField = (event, index) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const nextInput = additionalFieldsRef.current[index + 1];
    if (nextInput) nextInput.focus();
    else event.currentTarget.blur();
  };
  const saveReport = async () => {
    setError(""); setNotice("");
    if (!canReport) { setError("Nemate pravo da sačuvate obračun."); return; }
    if (!items.length) { setError("Nema artikala za obračun."); return; }
    for (const item of items) {
      const q = number(sold[item.id]); const a = canReport ? number(added[item.id]) : 0;
      if (q < 0 || a < 0 || !Number.isFinite(q) || !Number.isFinite(a)) { setError("Količine ne mogu biti negativne."); return; }
    }
    if (!window.confirm("Da li ste sigurni da želite da sačuvate obračun?")) return;
    setSaving(true);
    try {
      const latestSnapshot = await get(artikliRestoran());
      const latest = cleanItems(latestSnapshot.val());
      if (!latest.length) throw new Error("Na serveru nema artikala za obračun.");
      const updates = {};
      const snapshotItems = {};
      let totalCents = 0;
      latest.forEach((item) => {
        const q = number(sold[item.id]);
        const a = canReport ? number(added[item.id]) : 0;
        const previous = number(item.ostalo);
        const priceCents = parseCents(item.cijena);
        if (q < 0 || a < 0 || priceCents === null || priceCents < 0) throw new Error(`Provjeri količinu i cijenu artikla „${item.naziv}”.`);
        const newTotal = previous + a;
        const remaining = newTotal - q;
        const valueCents = Math.round(q * priceCents);
        const updatedItem = {
          ...objectValue(latestSnapshot.child(item.id).val()),
          stanje_prethodno: previous, ubaceno: a, ukupno: newTotal, kolicina: q,
          vrijednost: valueCents / 100, novo: remaining, ostalo: remaining,
        };
        snapshotItems[item.id] = updatedItem;
        const path = `Artikli/${item.id}/`;
        updates[`${path}stanje_prethodno`] = previous;
        updates[`${path}ubaceno`] = a;
        updates[`${path}ukupno`] = newTotal;
        updates[`${path}kolicina`] = q;
        updates[`${path}vrijednost`] = valueCents / 100;
        updates[`${path}novo`] = remaining;
        updates[`${path}ostalo`] = remaining;
        totalCents += valueCents;
      });
      const kitchenCents = canReport ? parseCents(fields.kuhinja || "0") : 0;
      const wagesCents = canReport ? parseCents(fields.dnevnice || "0") : 0;
      const staffCents = canReport ? parseCents(fields.osoblje || "0") : 0;
      const houseCents = canReport ? parseCents(fields.kuca || "0") : 0;
      if ([kitchenCents, wagesCents, staffCents, houseCents].some((value) => value === null || value < 0)) throw new Error("Unesi ispravne iznose koji nijesu negativni.");
      const total = totalCents;
      const kitchen = kitchenCents || 0;
      const income = total + kitchen;
      const expense = (wagesCents || 0) + (staffCents || 0) + (houseCents || 0);
      const report = {
        artikli: snapshotItems, ukupno: total / 100, kuhinja: kitchen / 100,
        zbir: income / 100, dnevnice: (wagesCents || 0) / 100,
        osoblje: (staffCents || 0) / 100, kuca: (houseCents || 0) / 100,
        rashod: expense / 100, zarada: (income - expense) / 100,
        smjena: fields.smjena.trim(),
        konobari: fields.konobari.trim(),
        sacuvano_u: Date.now(), sacuvano_od_uid: user?.uid || "",
      };
      const { date, time } = currentKeys();
      Object.entries(report).forEach(([key, value]) => { updates[`Forma/${date}/${time}/${key}`] = value; });
      await update(rootRestoran(), updates);
      setSelectedDate(date);
      setSelectedTime(time);
      setPendingLatestReport({ date, time });
      setNotice("Obračun je uspješno sačuvan.");
      showSuccessAnimation("Obračun je uspješno sačuvan.");
      setSold(Object.fromEntries(latest.map((item) => [item.id, "0"])));
      setAdded(Object.fromEntries(latest.map((item) => [item.id, "0"])));
      if (canReport) setFields({ smjena: "", konobari: "", kuhinja: "0", dnevnice: "0", osoblje: "0", kuca: "0" });
    } catch (saveError) {
      setError(`Obračun nije sačuvan: ${saveError.message}`);
    } finally { setSaving(false); }
  };

  const openNew = () => { setError(""); setDialogError(""); setForm({ naziv: "", jedinica_mjere: "", stanje_prethodno: "", ubaceno: "", kolicina: "", cijena: "" }); setDialog({ type: "new" }); };
  const openEdit = (item) => { setError(""); setDialogError(""); setForm({ naziv: item.naziv, jedinica_mjere: item.jedinica_mjere, stanje_prethodno: String(item.ostalo), ubaceno: String(item.ubaceno), kolicina: String(item.kolicina), cijena: String(item.cijena) }); setDialog({ type: "edit", id: item.id }); };
  const saveItem = async () => {
    const name = form.naziv.trim(); const price = parseCents(form.cijena); const stock = number(form.stanje_prethodno);
    const quantityAdded = number(form.ubaceno); const quantitySold = number(form.kolicina);
    if (!name || price === null || price < 0 || form.ubaceno.trim() === "" || (dialog.type === "edit" && form.stanje_prethodno.trim() === "") || stock < 0 || quantityAdded < 0 || quantitySold < 0) { setDialogError("Unesi naziv, početnu količinu i cijenu. Vrijednosti ne mogu biti negativne."); return; }
    setSaving(true); setError(""); setDialogError("");
    try {
      let id = dialog.id;
      if (dialog.type === "new") {
        const snapshot = await get(artikliRestoran());
        id = "1"; while (snapshot.hasChild(id)) id = String(Number(id) + 1);
        const initial = quantityAdded;
        await update(artikliRestoran(), { [id]: { redni_broj: id, naziv: name, jedinica_mjere: form.jedinica_mjere.trim(), stanje_prethodno: 0, ubaceno: initial, ukupno: initial, kolicina: 0, cijena: price / 100, vrijednost: 0, novo: initial, ostalo: initial, datum_unosa: new Date().toLocaleDateString("sr-Latn") } });
      } else {
        const total = stock + quantityAdded; const remainder = total - quantitySold;
        await update(artikliRestoran(), {
          [`${id}/naziv`]: name, [`${id}/jedinica_mjere`]: form.jedinica_mjere.trim(),
          [`${id}/stanje_prethodno`]: stock, [`${id}/ubaceno`]: quantityAdded,
          [`${id}/kolicina`]: quantitySold, [`${id}/cijena`]: price / 100,
          [`${id}/ukupno`]: total, [`${id}/novo`]: remainder, [`${id}/ostalo`]: remainder,
          [`${id}/vrijednost`]: Math.round(quantitySold * price) / 100,
        });
      }
      setDialog(null); setDialogError(""); setNotice(dialog.type === "new" ? "Artikal je dodat." : "Artikal je izmijenjen.");
      showSuccessAnimation(dialog.type === "new" ? "Artikal je dodat" : "Artikal izmijenjen");
    } catch (saveError) { setDialogError(`Izmjena nije sačuvana: ${saveError.message}`); }
    finally { setSaving(false); }
  };
  const deleteItem = async (item) => {
    if (!window.confirm(`Ukloniti „${item.naziv}” iz trenutnog stanja artikala? Istorijski obračuni ostaju.`)) return;
    try { await update(artikliRestoran(), { [item.id]: null }); setNotice("Artikal je obrisan."); showSuccessAnimation("Artikal obrisan"); }
    catch (deleteError) { setError(`Brisanje nije uspjelo: ${deleteError.message}`); }
  };

  if (!canReport) return <main style={pageStyle}><section style={{ ...panelStyle, maxWidth: 640, margin: "12vh auto" }}>Ovom obračunu mogu pristupiti Administrator i Konobar.</section></main>;

  const summaryFields = [
    ["Prihodi", [["Obračun pića", currentHistory.ukupno], ["Kuhinja", currentHistory.kuhinja], ["Ukupno", currentHistory.zbir]]],
    ["Rashod", [["Dnevnice", currentHistory.dnevnice], ["Osoblje", currentHistory.osoblje], ["Kuća", currentHistory.kuca], ["Zbir", currentHistory.rashod]]],
    ["Zarada", [["Zarada", currentHistory.zarada]]],
    ["Smjena / Konobari", [["Smjena", currentHistory.smjena], ["Konobari", historyWaiterNames]]],
  ];
  const summaryValue = (value) => value === null || value === undefined || value === "" ? "" : typeof value === "number" ? money(value) : String(value);

  const tableHeader = (actions = false) => <thead>
    <tr>{["#", "Naziv", "Jedinica", "Stanje prethodno", "Novo stanje", "Ubačeno", "Ukupno"].map((heading) => <th key={heading} rowSpan={2} style={headerCell}>{heading}</th>)}
      <th colSpan={3} style={{ ...headerCell, textAlign: "center" }}>PRODATO</th><th rowSpan={2} style={headerCell}>Ostalo</th>{actions && <th rowSpan={2} style={headerCell}>Akcije</th>}</tr>
    <tr>{["Količina", "Cijena", "Vrijednost"].map((heading) => <th key={heading} style={{ ...headerCell, textAlign: "center" }}>{heading}</th>)}</tr>
  </thead>;

  // 30-day accounting list
  const dailyObracunDates = Object.keys(dailyObracunHistory).sort((a, b) => b.localeCompare(a));
  const currentDailyRecord = selectedDailyDate ? dailyObracunHistory[selectedDailyDate] : null;
  const currentDailyItems = useMemo(() => {
    if (!selectedDailyDate) return [];
    const recordArtikli = currentDailyRecord?.artikli || {};
    // Prikazujemo sve artikle iz menija koji postoje ili koji su bili u obračunu
    const allIds = Array.from(new Set([
      ...menuStockItems.map((m) => m.id),
      ...Object.keys(recordArtikli)
    ]));
    allIds.sort((a, b) => /^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) - Number(b) : a.localeCompare(b));

    return allIds.map((id, idx) => {
      const d = recordArtikli[id];
      const menuItem = menuStockItems.find((m) => m.id === id);
      const name = d?.naziv || menuItem?.name || id;
      const currentStock = menuItem ? menuItem.stock : 0;

      if (d) {
        const p = number(d.stanje_prethodno !== undefined ? d.stanje_prethodno : (d.ostalo ?? d.stanje ?? currentStock));
        const u = number(d.ubaceno ?? 0);
        const k = number(d.kolicina ?? 0);
        const cijena = number(d.cijena ?? menuItem?.price ?? 0);
        const calculatedUkupno = d.ukupno !== undefined ? number(d.ukupno) : (p + u);
        const calculatedNovo = d.novo !== undefined ? number(d.novo) : (calculatedUkupno - k);
        const calculatedOstalo = d.ostalo !== undefined ? number(d.ostalo) : calculatedNovo;
        const calculatedVrijednost = d.vrijednost !== undefined ? number(d.vrijednost) : Math.round(k * cijena * 100) / 100;

        return {
          id,
          redni_broj: d.redni_broj || String(idx + 1),
          naziv: name,
          jedinica_mjere: d.jedinica_mjere || "",
          stanje_prethodno: p,
          novo: calculatedNovo,
          ubaceno: u,
          ukupno: calculatedUkupno,
          kolicina: k,
          cijena: cijena,
          vrijednost: calculatedVrijednost,
          ostalo: calculatedOstalo,
          stock: calculatedOstalo,
        };
      } else {
        // Artikal nije mijenjan tog dana -> stanje_prethodno = trenutno stanje, ostalo = trenutno stanje, nema prodaje i ubacivanja
        const price = menuItem ? menuItem.price : 0;
        return {
          id,
          redni_broj: String(idx + 1),
          naziv: name,
          jedinica_mjere: "",
          stanje_prethodno: currentStock,
          novo: currentStock,
          ubaceno: 0,
          ukupno: currentStock,
          kolicina: 0,
          cijena: price,
          vrijednost: 0,
          ostalo: currentStock,
          stock: currentStock,
        };
      }
    });
  }, [selectedDailyDate, currentDailyRecord, menuStockItems]);

  return <main style={pageStyle}>
    <div style={{ maxWidth: 1280, width: "100%", margin: "0 auto" }}>
      {/* SaaS MAIN PANEL */}
      <section style={{ ...panelStyle, border: "1px solid #cbd5e1", borderRadius: 18, background: "white" }}>
        {/* Top Control Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap", paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>Stanje artikala</h1>
            <p style={{ margin: 0, color: "#64748b", fontSize: 13.5 }}>Uživo praćenje zaliha pića, unos promjena i mjesečni obračuni.</p>
          </div>

          {/* Action buttons one under another with descriptions to the right */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 320 }}>
            {/* Red 1: DODAJ */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                type="button"
                style={{ ...buttonStyle, width: 140, background: "#176b55", borderColor: "#176b55", color: "white", padding: "9px 16px", boxShadow: "0 2px 8px rgba(23,107,85,0.25)" }}
                onClick={() => { setStockDialogError(""); setStockDialogConfirm(false); setStockDialogOpen(true); }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                DODAJ
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>Dodaj na stanje</span>
            </div>

            {/* Red 2: IZMIJENI */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                type="button"
                style={{ ...buttonStyle, width: 140, background: "#0284c7", borderColor: "#0284c7", color: "white", padding: "9px 16px" }}
                onClick={() => {
                  setStockEditError("");
                  setStockEditConfirm(false);
                  setMenuStockEditInputs(Object.fromEntries(menuStockItems.map((item) => [item.id, String(item.stock)])));
                  setStockEditDialogOpen(true);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                IZMIJENI
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>Izmijeni trenutno stanje artikala</span>
            </div>

          </div>
        </div>

        {/* 30-Day History Bar */}
        <div style={{ marginTop: 14, marginBottom: 14, background: "#f8fafc", padding: "12px 16px", borderRadius: 12, border: "1px solid #cbd5e1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#1e293b" }}>Istorija obračuna:</span>
              {dailyObracunDates.length > 0 ? (
                <select
                  aria-label="Izaberi datum sačuvanih obračuna"
                  style={{ ...inputStyle, width: "auto", minWidth: 160, padding: "7px 12px", fontSize: 13.5, fontWeight: 700 }}
                  value={selectedDailyDate}
                  onChange={(e) => {
                    setSelectedDailyDate(e.target.value);
                    setShowDailyHistory(true);
                  }}
                >
                  {dailyObracunDates.map((d) => (
                    <option key={d} value={d}>
                      {dailyObracunHistory[d]?.datum || d}
                    </option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: 13, color: "#94a3b8" }}>Još nema sačuvanih obračuna.</span>
              )}
            </div>
            {selectedDailyDate && currentDailyRecord && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: "#64748b" }}>Zabilježeno: <strong>{currentDailyRecord.vrijeme}</strong> ({currentDailyRecord.sacuvao || "Sistem"})</span>
                <button
                  type="button"
                  style={{ ...buttonStyle, padding: "6px 12px", fontSize: 12.5 }}
                  onClick={() => downloadPdfFile(`Obračun stanja - ${currentDailyRecord.datum}`, `${currentDailyRecord.datum} ${currentDailyRecord.vrijeme || ""}`, currentDailyItems, null, `Obracun_${selectedDailyDate}`, currentDailyRecord.sacuvao || "Sistem")}
                >
                  Štampaj dan (PDF)
                </button>
                <button
                  type="button"
                  style={{ ...buttonStyle, background: showDailyHistory ? "#b91c1c" : "#0284c7", color: "white", borderColor: showDailyHistory ? "#b91c1c" : "#0284c7", padding: "6px 12px", fontSize: 12.5 }}
                  onClick={() => setShowDailyHistory((prev) => !prev)}
                >
                  {showDailyHistory ? "Zatvori tabelu" : "Prikaži tabelu"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Selected Daily History Table View - Identical to Istorija Obracuna table, displayed directly underneath */}
        {selectedDailyDate && currentDailyRecord && showDailyHistory && (
          <div style={{ marginBottom: 20, border: "1px solid #cbd5e1", borderRadius: 12, overflow: "hidden", background: "#f8fafc", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#1e293b" }}>Obračun za dan: {currentDailyRecord.datum} ({currentDailyRecord.vrijeme})</h3>
                <span style={{ fontSize: 12.5, color: "#64748b" }}>Sačuvao: <strong>{currentDailyRecord.sacuvao || "Sistem"}</strong></span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12.5, color: "#64748b" }}>Broj stavki: <strong>{currentDailyItems.length}</strong></span>
                <button
                  type="button"
                  style={{ ...buttonStyle, background: "#b91c1c", color: "white", borderColor: "#b91c1c", padding: "4px 10px", fontSize: 12 }}
                  onClick={() => setShowDailyHistory(false)}
                >
                  Zatvori tabelu
                </button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
                {tableHeader(false)}
                <tbody>
                  {currentDailyItems.map((item, index) => (
                    <tr key={item.id} style={{ background: index % 2 ? "#f8fafc" : "white" }}>
                      <td style={{ ...cell, textAlign: "center" }}>{index + 1}</td>
                      <td style={{ ...cell, fontWeight: 600 }}>{item.naziv}</td>
                      <td style={{ ...cell, textAlign: "center" }}>{item.jedinica_mjere}</td>
                      <td style={{ ...cell, textAlign: "center" }}>{formatQuantity(item.stanje_prethodno)}</td>
                      <td style={{ ...cell, textAlign: "center", fontWeight: 700, color: "#0284c7" }}>{formatQuantity(item.novo)}</td>
                      <td style={{ ...cell, textAlign: "center" }}>{formatQuantity(item.ubaceno)}</td>
                      <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{formatQuantity(item.ukupno)}</td>
                      <td style={{ ...cell, textAlign: "center" }}>{formatQuantity(item.kolicina)}</td>
                      <td style={{ ...cell, textAlign: "right" }}>{money(item.cijena)} €</td>
                      <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{money(item.vrijednost)} €</td>
                      <td style={{ ...cell, textAlign: "center", fontWeight: 800, color: Number(item.ostalo) < 6 ? "#d32f2f" : "#176b55" }}>{formatQuantity(item.ostalo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Red: ŠTAMPAJ PDF (Odmah povise Trenutno stanje artikala) */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, marginBottom: 12 }}>
          <button
            type="button"
            style={{ ...buttonStyle, width: 140, background: "#334155", borderColor: "#334155", color: "white", padding: "9px 16px" }}
            disabled={!menuStockItems.length}
            onClick={() => downloadBeverageStockPdf(menuStockItems)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            ŠTAMPAJ PDF
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>Sačuvaj trenutno stanje u pdf</span>
        </div>

        {/* Live Table */}
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#000000" }}>
            Trenutno stanje artikala
          </h2>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 0, borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>{[["Ime artikla", "75%"], ["Stanje", "25%"]].map(([heading, width]) => <th key={heading} style={{ ...headerCell, width }}>{heading}</th>)}</tr>
            </thead>
            <tbody>
              {menuStockItems.length ? menuStockItems.map((item, index) => (
                <tr key={item.id} style={{ background: index % 2 ? "#f8fafc" : "white" }}>
                  <td style={{ ...cell, fontWeight: 600, color: "#1e293b", overflowWrap: "anywhere" }}>{item.name}</td>
                  <td style={{ ...cell, fontWeight: 800, color: Number(item.stock) < 6 ? "#d32f2f" : "#176b55", whiteSpace: "nowrap" }}>
                    {formatQuantity(item.stock)}
                  </td>
                </tr>
              )) : (
                <tr><td style={cell} colSpan={2}>Nema artikala u meniju pića.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* HIDDEN SECTIONS 1 - 4 (Preserved completely) */}
      <div style={{ display: "none" }}>
        {isAdmin && (<>
          <section style={panelStyle}><button onClick={openNew}>＋ Dodaj artikal</button></section>
          <section className="accounting-panel" style={panelStyle}>
            <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>{dates.map((date) => <option key={date} value={date}>{displayDate(date)}</option>)}</select>
            <select value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}>{times.map((time) => <option key={time} value={time}>{displayTime(time)}</option>)}</select>
            <button onClick={() => downloadPdfFile("Dnevni obračun pića", `${displayDate(selectedDate)} ${displayTime(selectedTime)}`, historyItems, currentHistory, `Obracun_${selectedDate}_${selectedTime}`, savedByName)}>PDF</button>
            <table>{tableHeader()}<tbody>{historyItems.map((item, index) => <tr key={item.id}><td>{item.naziv}</td></tr>)}</tbody></table>
          </section>
          <section className="accounting-panel" style={panelStyle}>
            <button onClick={() => downloadPdfFile("Stanje od poslednjeg obračuna artikala", currentPdfDateTime(), items, null, "Stanje_artikala")}>PDF</button>
            <table>{tableHeader(true)}<tbody>{items.map((item) => <tr key={item.id}><td><button onClick={() => openEdit(item)}>Izmijeni</button><button onClick={() => deleteItem(item)}>Obriši</button></td></tr>)}</tbody></table>
          </section>
        </>)}
        <section className="accounting-panel" style={panelStyle}>
          <table><tbody>{items.map((item, index) => <tr key={item.id}><td><input ref={(n) => { soldInputsRef.current[index] = n; }} value={sold[item.id] ?? "0"} onChange={(e) => setSold((c) => ({ ...c, [item.id]: e.target.value }))} /><input value={added[item.id] ?? "0"} onChange={(e) => setAdded((c) => ({ ...c, [item.id]: e.target.value }))} /></td></tr>)}</tbody></table>
          <button onClick={saveReport}>Sačuvaj obračun</button>
        </section>
      </div>
    </div>

    {/* OVERLAY & SPINNER */}
    {stockWorking && (
      <div role="status" aria-live="polite" style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.88)", backdropFilter: "blur(5px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 2500, pointerEvents: "all" }}>
        <div style={{ width: 54, height: 54, borderRadius: "50%", border: "4px solid rgba(255,255,255,0.2)", borderTopColor: "#ffffff", animation: "spin 0.8s linear infinite", marginBottom: 16 }} />
        <div style={{ color: "#ffffff", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Ažuriranje stanja pića</div>
        <div style={{ color: "#38bdf8", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Sačekajte...</div>
        {stockStage && stockStage !== "Sačekajte..." && <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{stockStage}</div>}
      </div>
    )}

    {/* SUCCESS ANIMATION OVERLAY */}
    {showSuccess && (
      <div className="animate-fadeIn" role="status" style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,.78)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <div className="animate-checkCircle" style={{ width: 112, height: 112, margin: "0 auto", borderRadius: "50%", background: "#f97316", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 50px rgba(249,115,22,.6)" }}>
            <svg width="62" height="62" viewBox="0 0 52 52" fill="none" aria-hidden="true"><path d="M14 27 L22 35 L39 16" stroke="black" pathLength="100" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="animate-drawCheck" /></svg>
          </div>
          <h1 style={{ marginTop: 30, color: "white", fontSize: 32, fontWeight: 900, animation: "textUp .45s ease-out" }}>{sentenceCase(successText)}</h1>
        </div>
      </div>
    )}

    {/* DODAJ DIALOG */}
    {stockDialogOpen && (
      <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !stockBusyId) { setStockDialogOpen(false); setStockDialogConfirm(false); } }} style={{ position: "fixed", zIndex: 25, inset: 0, background: "#0f172a80", display: "grid", placeItems: "center", padding: 14 }}>
        <section role="dialog" aria-modal="true" style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", background: "white", borderRadius: 18, padding: 22, boxShadow: "0 24px 70px rgba(0,0,0,0.25)" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{stockDialogConfirm ? "Potvrda dodavanja" : "Dodaj piće na stanje"}</h2>
          {!stockDialogConfirm ? <>
            <p style={{ margin: "0 0 14px", color: "#64748b", fontSize: 13 }}>Unesite količinu koju dodajete za svaki artikal.</p>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead><tr><th style={{ ...headerCell, width: "68%" }}>Ime artikla</th><th style={{ ...headerCell, width: "32%" }}>Dodaj</th></tr></thead>
                <tbody>{menuStockItems.map((item, index) => <tr key={item.id} style={{ background: index % 2 ? "#f8fafc" : "white" }}>
                  <td style={{ ...cell, overflowWrap: "anywhere", fontWeight: 600 }}>{item.name}</td>
                  <td style={cell}><input ref={index === 0 ? firstStockInputRef : undefined} placeholder="Količina" style={{ ...inputStyle, minWidth: 0, padding: "8px 7px" }} inputMode="decimal" value={menuStockInputs[item.id] ?? "0"} disabled={Boolean(stockBusyId || stockWorking)} onFocus={(e) => { if (e.target.value === "0") setMenuStockInputs((c) => ({ ...c, [item.id]: "" })); }} onBlur={(e) => { if (e.target.value === "") setMenuStockInputs((c) => ({ ...c, [item.id]: "0" })); }} onChange={(e) => { setStockDialogError(""); setMenuStockInputs((c) => ({ ...c, [item.id]: e.target.value })); }} /></td>
                </tr>)}</tbody>
              </table>
            </div>
          </> : <>
            <div style={{ display: "grid", gap: 6, maxHeight: "40vh", overflowY: "auto", paddingRight: 4, margin: "8px 0 14px" }}>
              {Object.entries(menuStockInputs).filter(([, raw]) => Number(String(raw ?? "").trim().replace(",", ".")) > 0).map(([id, raw]) => {
                const item = menuStockItems.find((entry) => entry.id === id);
                return <div key={id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 10px", background: "#f8fafc", borderRadius: 9, color: "#334155", fontSize: 13 }}><b>{item?.name || id}</b><span style={{ color: "#176b55", fontWeight: 700 }}>+{formatQuantity(raw)}</span></div>;
              })}
            </div>
            <p style={{ margin: "14px 0 8px", padding: 13, borderRadius: 11, background: "#f0fdf4", color: "#166534", lineHeight: 1.55, fontWeight: 600 }}>Da li ste sigurni da želite da dodate unijete količine artikala na stanje?</p>
          </>}
          {stockDialogError && <div role="alert" style={{ marginTop: 12, borderRadius: 9, padding: 10, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>{stockDialogError}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <button type="button" style={buttonStyle} disabled={Boolean(stockBusyId)} onClick={() => { setStockDialogConfirm(false); setStockDialogOpen(false); }}>{stockDialogConfirm ? "Ne, odustani" : "Otkaži"}</button>
            {!stockDialogConfirm
              ? <button type="button" style={{ ...buttonStyle, background: "#176b55", borderColor: "#176b55", color: "white" }} disabled={Boolean(stockBusyId) || !menuStockItems.length} onClick={requestMenuStockAdd}>DODAJ</button>
              : <button type="button" style={{ ...buttonStyle, background: "#176b55", borderColor: "#176b55", color: "white" }} disabled={Boolean(stockBusyId)} onClick={applyMenuStockAdd}>{stockBusyId ? "Dodajem…" : "Da, dodaj"}</button>}
          </div>
        </section>
      </div>
    )}

    {/* IZMIJENI DIALOG */}
    {stockEditDialogOpen && (
      <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !stockBusyId) { setStockEditDialogOpen(false); setStockEditConfirm(false); } }} style={{ position: "fixed", zIndex: 25, inset: 0, background: "#0f172a80", display: "grid", placeItems: "center", padding: 14 }}>
        <section role="dialog" aria-modal="true" style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", background: "white", borderRadius: 18, padding: 22, boxShadow: "0 24px 70px rgba(0,0,0,0.25)" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{stockEditConfirm ? "Potvrda izmjene stanja" : "Izmijeni stanja artikala"}</h2>
          {!stockEditConfirm ? <>
            <p style={{ margin: "0 0 14px", color: "#64748b", fontSize: 13 }}>Unesite novo stanje za artikle koje želite izmijeniti.</p>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead><tr><th style={{ ...headerCell, width: "50%" }}>Ime artikla</th><th style={{ ...headerCell, width: "24%" }}>Trenutno</th><th style={{ ...headerCell, width: "26%" }}>Novo stanje</th></tr></thead>
                <tbody>{menuStockItems.map((item, index) => <tr key={item.id} style={{ background: index % 2 ? "#f8fafc" : "white" }}>
                  <td style={{ ...cell, overflowWrap: "anywhere", fontWeight: 600 }}>{item.name}</td>
                  <td style={{ ...cell, fontWeight: 700, color: Number(item.stock) < 6 ? "#d32f2f" : "#176b55" }}>{formatQuantity(item.stock)}</td>
                  <td style={cell}><input ref={index === 0 ? firstStockEditInputRef : undefined} placeholder={String(item.stock)} style={{ ...inputStyle, minWidth: 0, padding: "8px 7px" }} inputMode="decimal" value={menuStockEditInputs[item.id] ?? ""} disabled={Boolean(stockBusyId || stockWorking)} onChange={(e) => { setStockEditError(""); setMenuStockEditInputs((c) => ({ ...c, [item.id]: e.target.value })); }} /></td>
                </tr>)}</tbody>
              </table>
            </div>
          </> : <>
            <div style={{ display: "grid", gap: 6, maxHeight: "40vh", overflowY: "auto", paddingRight: 4, margin: "8px 0 14px" }}>
              {Object.entries(menuStockEditInputs).filter(([id, raw]) => {
                const item = menuStockItems.find((m) => m.id === id);
                return item && Number(raw) !== item.stock;
              }).map(([id, raw]) => {
                const item = menuStockItems.find((m) => m.id === id);
                return <div key={id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 10px", background: "#f8fafc", borderRadius: 9, color: "#334155", fontSize: 13 }}><b>{item?.name || id}</b><span>{formatQuantity(item?.stock)} → <strong style={{ color: "#0284c7" }}>{formatQuantity(raw)}</strong></span></div>;
              })}
            </div>
            <p style={{ margin: "14px 0 8px", padding: 13, borderRadius: 11, background: "#f0f9ff", color: "#0369a1", lineHeight: 1.55, fontWeight: 600 }}>Da li ste sigurni da želite da sačuvate nova stanja za ove artikle?</p>
          </>}
          {stockEditError && <div role="alert" style={{ marginTop: 12, borderRadius: 9, padding: 10, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>{stockEditError}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <button type="button" style={buttonStyle} disabled={Boolean(stockBusyId)} onClick={() => { setStockEditConfirm(false); setStockEditDialogOpen(false); }}>{stockEditConfirm ? "Ne, odustani" : "Otkaži"}</button>
            {!stockEditConfirm
              ? <button type="button" style={{ ...buttonStyle, background: "#0284c7", borderColor: "#0284c7", color: "white" }} disabled={Boolean(stockBusyId) || !menuStockItems.length} onClick={requestStockEdit}>Sačuvaj</button>
              : <button type="button" style={{ ...buttonStyle, background: "#0284c7", borderColor: "#0284c7", color: "white" }} disabled={Boolean(stockBusyId)} onClick={applyMenuStockEdit}>{stockBusyId ? "Čuvam…" : "Da, sačuvaj"}</button>}
          </div>
        </section>
      </div>
    )}

    {/* OLD ARTICLE DIALOG */}
    {dialog && <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDialog(null); }} style={{ position: "fixed", zIndex: 20, inset: 0, background: "#0f172a80", display: "grid", placeItems: "center", padding: 14 }}>
      <section role="dialog" aria-modal="true" style={{ width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", background: "white", borderRadius: 16, padding: 20 }}>
        <h2>{dialog.type === "new" ? "Novi artikal" : "Izmijeni artikal"}</h2>
        <div style={{ display: "grid", gap: 11 }}>
          {[["naziv", "Naziv artikla", "text"], ["jedinica_mjere", "Jedinica mjere", "text"], ...(dialog.type === "edit" ? [["stanje_prethodno", "Preostalo stanje", "decimal"]] : []), ["ubaceno", dialog.type === "new" ? "Početno ubačeno" : "Ubačeno", "decimal"], ...(dialog.type === "edit" ? [["kolicina", "Prodato", "decimal"]] : []), ["cijena", "Cijena (€)", "decimal"]].map(([key, label, type]) => <label key={key} style={{ display: "grid", gap: 5, color: "#62736c", fontSize: 12, fontWeight: 750 }}>{label}<input style={inputStyle} value={form[key]} onChange={(e) => setForm((c) => ({ ...c, [key]: e.target.value }))} /></label>)}
        </div>
        {dialogError && <div role="alert" style={{ marginTop: 12, borderRadius: 9, padding: 10, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>{dialogError}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button style={buttonStyle} onClick={() => setDialog(null)}>Otkaži</button><button disabled={saving} style={{ ...buttonStyle, background: "#176b55", borderColor: "#176b55", color: "white" }} onClick={saveItem}>{saving ? "Čuvam…" : "Sačuvaj"}</button></div>
      </section>
    </div>}
  </main>;
}
