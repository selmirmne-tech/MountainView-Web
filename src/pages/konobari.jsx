import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isFirstShift } from "../utils/smjenaManager";
import { onValue, get, update, runTransaction } from "firebase/database";
import {
  completeOrdersRestoran,
  completeOrderRef,
  rootRestoran,
  globalLockRef,
  totalPriceRestoran,
  waiterStatistics,
  mjeseciRestoran,
  menuDrinkItem,
  menuDrinkStockPath,
} from "../firebase/refs";
import * as N from "../firebase/nodes";

const parsePrice = (value) => {
  const cleaned = String(value ?? "0").replace(",", ".").replace(/[^0-9.-]/g, "");
  return Number(cleaned) || 0;
};

const formatMoney = (value) =>
  `${value.toLocaleString("sr-Latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const receiptStockItems = (receipt) => {
  const raw = receipt?.[N.STOCK_ITEMS];
  return Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
};

const parseStatusDate = (status) => {
  if (!status || !status.startsWith("Complete")) return null;
  try {
    const raw = status.replace("Complete", "").trim();
    const m = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s(\d{1,2}):(\d{1,2}):(\d{1,2})/);
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
  } catch { return null; }
};

const formatReceiptDay = (date) => {
  const weekdays = ["Nedelja", "Ponedeljak", "Utorak", "Srijeda", "Četvrtak", "Petak", "Subota"];
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${weekdays[date.getDay()]}, ${day}/${month}/${date.getFullYear()}`;
};

const withTimeout = (promise, timeoutMs, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label}: Firebase nije odgovorio u roku od ${Math.round(timeoutMs / 1000)} sekundi.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
};

export default function Konobari() {
  const [completedOrders, setCompletedOrders] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const waiterIdParam = searchParams.get("waiter");
  const [waiterReceipts, setWaiterReceipts] = useState([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);

  // Storno dialog & persistent progress
  const [stornoTarget, setStornoTarget] = useState(null); // receipt item for dialog
  const [stornoActiveItem, setStornoActiveItem] = useState(null); // active item being stornated
  const [stornoReason, setStornoReason] = useState("");
  const [stornoReturnStock, setStornoReturnStock] = useState(null);
  const [stornoError, setStornoError] = useState("");
  const [stornoWorking, setStornoWorking] = useState(false);
  const [stornoStage, setStornoStage] = useState("");
  const [stornoSuccess, setStornoSuccess] = useState(false);
  const [stornoAlertMsg, setStornoAlertMsg] = useState("");

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = (user?.titula || user?.role) === "Administrator";

  useEffect(() => {
    window.scrollTo(0, 0);
    return onValue(completeOrdersRestoran(), (snapshot) => {
      setCompletedOrders(snapshot.val() || {});
      setLoading(false);
    }, (firebaseError) => {
      setError(firebaseError.message);
      setLoading(false);
    });
  }, []);

  // Prevent user from accidentally closing/reloading page during storno
  useEffect(() => {
    if (!stornoWorking) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "Storniranje računa je u toku. Molimo ne zatvarajte stranicu dok se ne završi.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [stornoWorking]);

  // Check if a storno was in-flight when page was last closed/reloaded
  useEffect(() => {
    const raw = localStorage.getItem("pending_storno_web");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      const age = Date.now() - (saved.timestamp || 0);
      if (age > 10 * 60 * 1000) {
        localStorage.removeItem("pending_storno_web");
        return;
      }
      // Check in Firebase if already voided
      get(completeOrderRef(saved.userId, saved.orderId)).then((snap) => {
        if (!snap.exists() || snap.child("obrisano").val() === true) {
          localStorage.removeItem("pending_storno_web");
        } else {
          executeStornoTask(
            { orderId: saved.orderId, ...snap.val() },
            saved.userId,
            saved.razlog || "",
            saved.adminName || "Administrator",
            saved.returnStock === true
          );
        }
      }).catch(() => {
        localStorage.removeItem("pending_storno_web");
      });
    } catch (_) {
      localStorage.removeItem("pending_storno_web");
    }
  }, []);

  // Back button routing:
  // When in waiters list (!waiterIdParam), browser Back leads to /stats
  // When in waiter receipts (waiterIdParam), browser Back leads to /konobari
  useEffect(() => {
    if (!waiterIdParam) {
      const handlePopState = () => {
        navigate("/stats", { replace: true });
      };
      window.addEventListener("popstate", handlePopState, { once: true });
      return () => window.removeEventListener("popstate", handlePopState);
    }
  }, [waiterIdParam, navigate]);

  // ── Earnings summary (excludes stornated) ─────────────────
  const earnings = useMemo(() => {
    // Map: userId → { name, total }
    const totals = new Map();
    Object.entries(completedOrders).forEach(([userId, orders]) => {
      Object.values(orders || {}).forEach((order) => {
        const name = String(order?.orderPersonName || "Nepoznat korisnik").trim();
        const prev = totals.get(userId) || { name, total: 0 };
        totals.set(userId, { name, total: prev.total + (order?.obrisano === true ? 0 : parsePrice(order?.totalPrice)) });
      });
    });
    return [...totals.entries()]
      .map(([userId, { name, total }]) => ({ userId, name, total }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "sr"));
  }, [completedOrders]);

  const total = earnings.reduce((sum, w) => sum + w.total, 0);
  const waiterReceiptGroups = useMemo(() => {
    const groups = [];
    waiterReceipts.forEach((order) => {
      const date = parseStatusDate(order.status);
      const key = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : "unknown-date";
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        group = { key, title: date ? formatReceiptDay(date) : "Datum nije dostupan", orders: [] };
        groups.push(group);
      }
      group.orders.push(order);
    });
    return groups;
  }, [waiterReceipts]);

  // Selected waiter is encoded in the URL so receipts can be refreshed directly.
  const selectedWaiter = useMemo(() => {
    if (!waiterIdParam) return null;
    const found = earnings.find((w) => w.userId === waiterIdParam);
    if (found) return found;
    const orders = completedOrders[waiterIdParam] || {};
    let name = "Konobar";
    for (const o of Object.values(orders)) {
      if (o?.orderPersonName) {
        name = o.orderPersonName;
        break;
      }
    }
    return { userId: waiterIdParam, name };
  }, [waiterIdParam, earnings, completedOrders]);

  const openWaiter = useCallback((waiter) => {
    setSearchParams({ waiter: waiter.userId });
  }, [setSearchParams]);

  // Keep receipts updated when completedOrders or selectedWaiter changes
  useEffect(() => {
    if (!selectedWaiter) {
      setWaiterReceipts([]);
      return;
    }
    const orders = completedOrders[selectedWaiter.userId] || {};
    const list = Object.entries(orders).map(([orderId, order]) => ({ orderId, ...order }));
    list.sort((a, b) => {
      const da = parseStatusDate(a.status);
      const db_ = parseStatusDate(b.status);
      return (db_ ? db_.getTime() : 0) - (da ? da.getTime() : 0);
    });
    setWaiterReceipts(list);
  }, [completedOrders, selectedWaiter]);

  // ── Storniranje ───────────────────────────────────────────
  const executeStornoTask = async (item, userId, razlog, adminName, returnStock = false) => {
    setStornoWorking(true);
    setStornoActiveItem({ ...item, razlog, userId });
    setStornoError("");
    setStornoStage("Preuzimanje locka kase…");

    const orderId = item.orderId;
    const orderRef = completeOrderRef(userId, orderId);
    const now = new Date();
    const vrijemeStr = `${String(now.getDate()).padStart(2,"0")}-${String(now.getMonth()+1).padStart(2,"0")}-${now.getFullYear()} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;

    const statusDate = parseStatusDate(item.status);
    const isPrva = isFirstShift(statusDate || now);

    const d = statusDate || now;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const monthKey = `${yyyy}-${mm}`;

    // Persist in localStorage so it can resume if page is reloaded
    localStorage.setItem("pending_storno_web", JSON.stringify({
      orderId,
      userId,
      orderPersonName: item.orderPersonName || "",
      totalPrice: item.totalPrice || "0",
      razlog,
      adminName,
      returnStock,
      timestamp: Date.now()
    }));

    const lockRef = globalLockRef();
    const lockLeaseMs = 15 * 1000;
    const token = `LOCK:STORNO:${orderId}:WEB:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
    let lockAttempted = false;
    let lockReleasedByCommit = false;
    let stage = "Preuzimanje locka";

    try {
      lockAttempted = true;
      let acquired = false;

      // Retry up to 20 times (2s delay = ~40s max wait)
      for (let attempt = 1; attempt <= 20; attempt++) {
        setStornoStage(attempt === 1 ? "Preuzimanje locka kase…" : `Čeka se oslobađanje kase (${attempt}/20)…`);

        const lockTx = await withTimeout(
          runTransaction(lockRef, (currentValue) => {
            const owner = currentValue == null ? null : String(currentValue);
            const isFree = owner == null || owner.toLowerCase() === "false";
            if (isFree) return token;
            return;
          }, { applyLocally: false }),
          8000, stage
        );

        if (lockTx.committed && lockTx.snapshot.val() === token) {
          try { await update(lockRef.parent, { GlobalLockUpdatedAt: Date.now() }); } catch (_) { }
          acquired = true;
          break;
        }

        // Force-acquire if existing lock is expired (>15s)
        try {
          const leaseSnap = await withTimeout(get(lockRef.parent.child("GlobalLockUpdatedAt")), 5000, "Provjera lease");
          const leaseAt = Number(leaseSnap.val()) || 0;
          if (leaseAt > 0 && Date.now() - leaseAt > lockLeaseMs) {
            console.warn("WEB_STORNO_LOCK_EXPIRED forcing acquire", { attempt, leaseAgeMs: Date.now() - leaseAt });
            await update(lockRef.parent, { [N.GLOBAL_LOCK]: token, GlobalLockUpdatedAt: Date.now() });
            acquired = true;
            break;
          }
        } catch (_) { }

        if (attempt < 20) await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }

      if (!acquired) throw new Error("Kasa je zauzeta. Pokušajte ponovo za trenutak.");

      stage = "Čitanje računa";
      setStornoStage("Čitanje podataka računa…");
      const freshReceipt = await withTimeout(get(orderRef), 12000, stage);
      if (!freshReceipt.exists()) {
        localStorage.removeItem("pending_storno_web");
        throw new Error("Račun više ne postoji u bazi.");
      }
      if (freshReceipt.child("obrisano").val() === true) {
        localStorage.removeItem("pending_storno_web");
        throw new Error("Ovaj račun je već storniran.");
      }
      const price = parsePrice(freshReceipt.val().totalPrice);
      const stockReturnQuantities = new Map();
      if (returnStock) {
        receiptStockItems(freshReceipt.val()).forEach((stockItem) => {
          const menuItemId = String(stockItem?.[N.STOCK_ITEM_ID] ?? "");
          const quantity = Number(stockItem?.[N.STOCK_ITEM_QUANTITY]);
          if (/^[A-Za-z0-9_-]+$/.test(menuItemId) && Number.isInteger(quantity) && quantity > 0) {
            stockReturnQuantities.set(menuItemId, (stockReturnQuantities.get(menuItemId) || 0) + quantity);
          }
        });
      }

      stage = "Čitanje pazara";
      setStornoStage("Čitanje pazara i statistike…");
      const [totalSnap, waiterSnap, monthSnap] = await Promise.all([
        withTimeout(get(totalPriceRestoran()), 12000, stage),
        withTimeout(get(waiterStatistics(userId)), 12000, stage),
        withTimeout(get(mjeseciRestoran()), 12000, stage),
      ]);
      const stockSnapshots = returnStock
        ? await Promise.all([...stockReturnQuantities.keys()].map(async (menuItemId) => [
            menuItemId,
            await withTimeout(get(menuDrinkItem(menuItemId)), 12000, "Čitanje stanja pića"),
          ]))
        : [];

      const curTotal = parsePrice(totalSnap.child(N.TOTAL_RESTORAN).val());
      const curPrva  = parsePrice(totalSnap.child(N.TOTAL_PRVA).val());
      const curDruga = parsePrice(totalSnap.child(N.TOTAL_DRUGA).val());
      const newTotal = Math.max(0, curTotal - price);
      const newPrva  = isPrva  ? Math.max(0, curPrva  - price) : curPrva;
      const newDruga = !isPrva ? Math.max(0, curDruga - price) : curDruga;

      const daySnap = waiterSnap.child(yyyy.toString()).child(mm).child(dd);
      const curRevenue = parsePrice(daySnap.child("totalRevenue").val());
      const curOrders  = Number(daySnap.child("totalOrders").val()) || 0;
      const curMonth   = parsePrice(monthSnap.child(monthKey).val());

      const fmt = (n) => n.toFixed(2);

      const updates = {
        [`${N.TOTAL_PRICE_RESTORAN}/${N.TOTAL_RESTORAN}`]: fmt(newTotal),
        [`${N.TOTAL_PRICE_RESTORAN}/${N.TOTAL_PRVA}`]: fmt(newPrva),
        [`${N.TOTAL_PRICE_RESTORAN}/${N.TOTAL_DRUGA}`]: fmt(newDruga),
        [`${N.TOTAL_PRICE_RESTORAN}/${N.GLOBAL_LOCK}`]: "False",
        [`${N.TOTAL_PRICE_RESTORAN}/GlobalLockUpdatedAt`]: null,
        [`${N.STATISTICS}/${N.KONOBARI}/${userId}/${yyyy}/${mm}/${dd}/totalRevenue`]: fmt(Math.max(0, curRevenue - price)),
        [`${N.STATISTICS}/${N.KONOBARI}/${userId}/${yyyy}/${mm}/${dd}/totalOrders`]: Math.max(0, curOrders - 1),
        [`${N.STATISTICS}/${N.MJESECI_RESTORAN}/${monthKey}`]: fmt(Math.max(0, curMonth - price)),
        [`${N.COMPLETE_ORDERS_RESTORAN}/${userId}/${orderId}/obrisano`]: true,
        [`${N.COMPLETE_ORDERS_RESTORAN}/${userId}/${orderId}/razlogStorniranja`]: razlog.trim(),
        [`${N.COMPLETE_ORDERS_RESTORAN}/${userId}/${orderId}/vrijemeStorniranja`]: vrijemeStr,
        [`${N.COMPLETE_ORDERS_RESTORAN}/${userId}/${orderId}/stornirao`]: adminName,
        [`${N.COMPLETE_ORDERS_RESTORAN}/${userId}/${orderId}/${N.RECEIPT_STOCK_RETURNED}`]: returnStock,
      };
      if (returnStock) {
        stockSnapshots.forEach(([menuItemId, itemSnapshot]) => {
          if (!itemSnapshot.exists()) return;
          const currentStock = parsePrice(itemSnapshot.child(N.MENU_STANJE).val());
          const addedQty = stockReturnQuantities.get(menuItemId) || 0;
          updates[menuDrinkStockPath(menuItemId)] = Math.round((currentStock + addedQty) * 100) / 100;
        });

        // Ažuriraj dnevni obračun za danas: stornirani artikli se tretiraju kao UBAČENO (povećava se ubaceno, novo, ukupno, ostalo)
        try {
          const pad = (num) => String(num).padStart(2, "0");
          const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
          const obracunArtikliPath = `${N.ROOT_RESTORAN}/${N.OBRACUN}/${todayIso}/artikli`;

          for (const [menuItemId, addedQty] of stockReturnQuantities.entries()) {
            const snapshotEntry = stockSnapshots.find((s) => s[0] === menuItemId);
            const currentStock = snapshotEntry && snapshotEntry[1].exists() ? parsePrice(snapshotEntry[1].child(N.MENU_STANJE).val()) : 0;
            const targetArtikalSnap = await get(child(child(obracunRestoran(), todayIso), `artikli/${menuItemId}`));
            const targetArtikal = targetArtikalSnap.exists() ? targetArtikalSnap.val() : null;

            const prevNovo = targetArtikal?.novo !== undefined ? Number(targetArtikal.novo) : currentStock;
            const prevUbaceno = targetArtikal?.ubaceno !== undefined ? Number(targetArtikal.ubaceno) : 0;
            const prevUkupno = targetArtikal?.ukupno !== undefined ? Number(targetArtikal.ukupno) : currentStock;
            const prevOstalo = targetArtikal?.ostalo !== undefined ? Number(targetArtikal.ostalo) : currentStock;

            const calcNovo = Math.round((prevNovo + addedQty) * 100) / 100;
            const calcUbaceno = Math.round((prevUbaceno + addedQty) * 100) / 100;
            const calcUkupno = Math.round((prevUkupno + addedQty) * 100) / 100;
            const calcOstalo = Math.round((prevOstalo + addedQty) * 100) / 100;

            updates[`${obracunArtikliPath}/${menuItemId}/novo`] = calcNovo;
            updates[`${obracunArtikliPath}/${menuItemId}/ubaceno`] = calcUbaceno;
            updates[`${obracunArtikliPath}/${menuItemId}/ukupno`] = calcUkupno;
            updates[`${obracunArtikliPath}/${menuItemId}/ostalo`] = calcOstalo;
            updates[`${obracunArtikliPath}/${menuItemId}/stanje`] = calcNovo;
          }
        } catch (obracunErr) {
          console.warn("WEB_STORNO_OBRACUN_UPDATE_FAILED", obracunErr);
        }
      }

      stage = "Upis storna";
      setStornoStage("Upis storna i oslobađanje kase…");
      await withTimeout(update(rootRestoran(), updates), 20000, stage);
      lockReleasedByCommit = true;

      // Succeeded! Clean up persistence
      localStorage.removeItem("pending_storno_web");
      setStornoWorking(false);
      setStornoActiveItem(null);
      setStornoStage("");
      setStornoSuccess(true);
      window.setTimeout(() => setStornoSuccess(false), 2200);

    } catch (err) {
      console.error("WEB_STORNO_FAILED", { orderId, stage, error: err });
      localStorage.removeItem("pending_storno_web");
      setStornoWorking(false);
      setStornoActiveItem(null);
      setStornoStage("");
      const msg = `Greška pri storniranju: ${err.message}`;
      setStornoAlertMsg(msg);
      window.setTimeout(() => setStornoAlertMsg(""), 7000);
    } finally {
      if (lockAttempted && !lockReleasedByCommit) {
        try {
          await Promise.race([
            runTransaction(lockRef, (currentValue) => {
              if (String(currentValue) === token) return "False";
              return;
            }, { applyLocally: false }),
            new Promise((resolve) => window.setTimeout(resolve, 8000)),
          ]);
          try { await update(lockRef.parent, { GlobalLockUpdatedAt: null }); } catch (_) { }
        } catch (e) {
          console.error("Ne mogu osloboditi lock", e);
        }
      }
    }
  };

  const handleStorno = () => {
    if (!stornoReason.trim()) {
      setStornoError("Razlog je obavezan!");
      return;
    }
    const item = stornoTarget;
    const userId = selectedWaiter?.userId;
    if (!item || !userId) return;
    const hasStockItems = receiptStockItems(item).some((stockItem) =>
      /^[A-Za-z0-9_-]+$/.test(String(stockItem?.[N.STOCK_ITEM_ID] ?? "")) &&
      Number.isInteger(Number(stockItem?.[N.STOCK_ITEM_QUANTITY])) && Number(stockItem[N.STOCK_ITEM_QUANTITY]) > 0);
    if (hasStockItems && stornoReturnStock === null) {
      setStornoError("Izaberite da li vraćate piće na stanje.");
      return;
    }

    // Immediately close dialog so user can't tap buttons multiple times
    setStornoTarget(null);
    setStornoError("");

    const adminName = user?.ime || user?.name || user?.displayName || "Administrator";
    executeStornoTask(item, userId, stornoReason.trim(), adminName, stornoReturnStock === true);
    setStornoReason("");
  };

  // ── Render: Receipt list view ──────────────────────────────
  if (selectedWaiter) {
    return (
      <main style={{ minHeight: "100vh", padding: "0 0 48px", background: "#f2f2f2", fontFamily: "Inter,system-ui,sans-serif" }}>
        {/* Header */}
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 16px 0", width: "100%", boxSizing: "border-box" }}>
          
          <div style={{ background: "linear-gradient(135deg, #123d32, #176b55)", color: "white", padding: "20px 24px", borderRadius: 20, marginBottom: 12, textAlign: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
            <div style={{ fontSize: 12, opacity: 0.8, letterSpacing: ".12em", fontWeight: 800 }}>RAČUNI KONOBARA</div>
            <div style={{ fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 850, marginTop: 5 }}>{selectedWaiter.name}</div>
            <div style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>{formatMoney(waiterReceipts.reduce((sum, order) => sum + (order.obrisano === true ? 0 : parsePrice(order.totalPrice)), 0))}</div>
          </div>
        </div>

        <div style={{ maxWidth: 820, margin: "0 auto", padding: "2px 19px 24px" }}>
          {waiterReceipts.length === 0 && (
            <div style={{ background: "white", padding: 18, borderRadius: 14, color: "#718078" }}>Nema računa.</div>
          )}
          {waiterReceiptGroups.map((group) => (
            <section key={group.key} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 2px" }}>
                <h2 style={{ margin: 0, color: "#173c32", fontSize: 15, fontWeight: 850 }}>{group.title}</h2>
                <span style={{ padding: "4px 9px", borderRadius: 999, background: "#e3eee9", color: "#36584b", fontSize: 11, fontWeight: 750, whiteSpace: "nowrap" }}>{group.orders.length} računa</span>
              </div>
              {group.orders.map((order) => {
            const isStorniran = order.obrisano === true;
            return (
              <div key={order.orderId} style={{
                background: "white",
                border: "1px solid #e2eae6",
                borderLeft: "4px solid #176B55",
                borderRadius: 16,
                padding: "15px 16px",
                boxShadow: "0 3px 12px #0a2d230a",
              }}>
                {isStorniran && (
                  <div style={{ color: "#C62828", fontWeight: 800, fontSize: 12, marginBottom: 6, letterSpacing: ".05em" }}>● STORNIRAN</div>
                )}
                <div style={{ fontWeight: 800, color: "#173C32", fontSize: 15 }}>{order.orderPersonName}</div>
                <div style={{ fontSize: 13, color: "#47635a", whiteSpace: "pre-wrap", marginTop: 4 }}>{order.name}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 11, color: "#718078" }}>{order.status}</div>
                    <div style={{ fontWeight: 850, fontSize: 17, color: "#176B55" }}>
                    {order.totalPrice} €
                  </div>
                </div>
                {isStorniran && order.razlogStorniranja && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#C62828", fontStyle: "italic" }}>
                    Razlog: {order.razlogStorniranja}
                  </div>
                )}
                {isStorniran && order.vrijemeStorniranja && (
                  <div style={{ fontSize: 11, color: "#C62828", opacity: 0.7, marginTop: 2 }}>
                    Stornirano: {order.vrijemeStorniranja}
                  </div>
                )}
                {isStorniran && order.stornirao && (
                  <div style={{ fontSize: 11, color: "#9F2D2D", marginTop: 2 }}>Stornirao: {order.stornirao}</div>
                )}
                {!isStorniran && isAdmin && (
                  <button
                    onClick={() => { setStornoTarget(order); setStornoReason(""); setStornoReturnStock(null); setStornoError(""); }}
                    style={{
                      marginTop: 10, padding: "6px 14px",
                      background: "#FFF5F5", color: "#C62828",
                      border: "1px solid #FFCDD2", borderRadius: 8,
                      fontWeight: 700, fontSize: 13, cursor: "pointer"
                    }}
                  >
                    🗑 Storniraj
                  </button>
                )}
              </div>
            );
              })}
            </section>
          ))}
        </div>

        {/* Storno Dialog */}
        {stornoTarget && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
            onClick={() => !stornoWorking && setStornoTarget(null)}
          >
            <div onClick={e => e.stopPropagation()} style={{ background: "#f7faf8", borderRadius: 20, padding: 1, width: "100%", maxWidth: 500, maxHeight: "90dvh", overflow: "hidden", boxShadow: "0 24px 60px #0004" }}>
              <div style={{ background: "linear-gradient(120deg,#0F6B52,#1686B6)", padding: "17px 20px", color: "white", fontSize: 19, fontWeight: 850 }}>Storniranje računa</div>
              <div style={{ padding: "18px 20px 20px", maxHeight: "calc(90dvh - 60px)", overflowY: "auto" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#173C32" }}>{stornoTarget.orderPersonName}</div>
              {stornoTarget.addittionalInfo && <div style={{ marginTop: 8, padding: "9px 11px", background: "#eef4f1", borderRadius: 10, color: "#52665E", fontSize: 13 }}><b>Dodatne informacije</b><br />{stornoTarget.addittionalInfo}</div>}
              <div style={{ marginTop: 14, color: "#176B55", fontSize: 12, fontWeight: 850, letterSpacing: ".06em" }}>NARUČENI ARTIKLI</div>
              <div style={{ display: "grid", gap: 7, marginTop: 7 }}>
                {String(stornoTarget.name || "").split(/\r?\n/).map((name, index) => {
                  const description = String(stornoTarget.description || "").split(/\r?\n/)[index] || "";
                  if (!name.trim() && !description.trim()) return null;
                  return <div key={`${index}-${name}`} style={{ background: "white", border: "1px solid #dfe9e4", borderRadius: 11, padding: "10px 12px" }}><div style={{ color: "#203D34", fontWeight: 800, fontSize: 14 }}>{name}</div>{description && <div style={{ color: "#687A73", fontSize: 12, marginTop: 3 }}>{description}</div>}</div>;
                })}
              </div>
              <div style={{ marginTop: 12, color: "#176B55", fontWeight: 850, fontSize: 17 }}>{formatMoney(parsePrice(stornoTarget.totalPrice))}</div>
              <label style={{ fontSize: 13, fontWeight: 750, color: "#9F2D2D", display: "block", margin: "14px 0 6px" }}>Razlog storniranja *</label>
              <textarea rows={3} value={stornoReason} onChange={e => setStornoReason(e.target.value)} placeholder="Unesite razlog..." disabled={stornoWorking} style={{ width: "100%", padding: "11px 12px", borderRadius: 11, border: "1px solid #d8e4de", background: "white", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outlineColor: "#1686B6" }} />
              {receiptStockItems(stornoTarget).some((stockItem) => /^[A-Za-z0-9_-]+$/.test(String(stockItem?.[N.STOCK_ITEM_ID] ?? "")) && Number.isInteger(Number(stockItem?.[N.STOCK_ITEM_QUANTITY])) && Number(stockItem[N.STOCK_ITEM_QUANTITY]) > 0) && <fieldset style={{ border: "1px solid #d8e4de", borderRadius: 11, padding: "10px 12px", margin: "12px 0 0", background: "white" }}>
                <legend style={{ padding: "0 5px", color: "#203D34", fontWeight: 750, fontSize: 13 }}>Da li je piće vraćeno na stanje?</legend>
                <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", color: "#344b42", fontSize: 13 }}><input type="radio" name="storno-stock-return" checked={stornoReturnStock === true} onChange={() => { setStornoReturnStock(true); setStornoError(""); }} disabled={stornoWorking} />Da, vrati piće na stanje</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", color: "#344b42", fontSize: 13 }}><input type="radio" name="storno-stock-return" checked={stornoReturnStock === false} onChange={() => { setStornoReturnStock(false); setStornoError(""); }} disabled={stornoWorking} />Ne, piće nije vraćeno</label>
              </fieldset>}
              {stornoWorking && stornoStage && <div role="status" style={{ color: "#52665E", fontSize: 12, marginTop: 8 }}>{stornoStage}</div>}
              {stornoError && <div style={{ color: "#C62828", fontSize: 12, marginTop: 5 }}>{stornoError}</div>}
              <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
                <button
                  onClick={() => setStornoTarget(null)}
                  disabled={stornoWorking}
                  style={{ flex: 1, padding: "11px 0", background: "#f4f7f6", border: "1px solid #e2eae6", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                >
                  Odustani
                </button>
                <button
                  onClick={handleStorno}
                  disabled={stornoWorking}
                  style={{ flex: 1, padding: "11px 0", background: "#C62828", color: "white", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                >
                  {stornoWorking ? "..." : "Storniraj"}
                </button>
              </div>
              </div>
            </div>
          </div>
        )}
        {stornoSuccess && (
          <div className="animate-fadeIn" style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,.88)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div className="animate-checkCircle" style={{ width: 120, height: 120, borderRadius: "50%", background: "linear-gradient(135deg,#ffb100,#ff7a00)", display: "flex", justifyContent: "center", alignItems: "center", boxShadow: "0 0 60px rgba(255,145,0,.55)", margin: "0 auto" }}>
                <svg width="70" height="70" viewBox="0 0 52 52" fill="none"><path d="M14 27 L22 35 L39 16" stroke="black" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="animate-drawCheck" /></svg>
              </div>
              <h1 style={{ marginTop: 30, color: "white", fontSize: "clamp(24px, 7vw, 42px)", fontWeight: 900 }}>Račun storniran</h1>
            </div>
          </div>
        )}

        {/* Full-screen Frozen Storno Overlay */}
        {stornoWorking && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1800,
              background: "rgba(10, 26, 20, 0.88)",
              backdropFilter: "blur(10px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              color: "white",
              textAlign: "center",
              userSelect: "none",
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                border: "5px solid rgba(255,255,255,0.2)",
                borderTopColor: "#ff9100",
                borderRadius: "50%",
                animation: "spin 0.9s linear infinite",
                marginBottom: 22,
              }}
            />
            <h2 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 850, letterSpacing: "-0.01em" }}>
              Storniranje
            </h2>
            <div style={{ color: "#ffb74d", fontSize: 17, fontWeight: 750, marginBottom: 14 }}>
              Sačekajte...
            </div>
            {stornoStage && stornoStage !== "Sačekajte..." && (
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginBottom: 14 }}>
                {stornoStage}
              </div>
            )}
            {stornoActiveItem && (
              <div
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 14,
                  padding: "14px 20px",
                  maxWidth: 440,
                  width: "100%",
                  marginBottom: 18,
                  fontSize: 14,
                  textAlign: "left",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ fontWeight: 800, color: "#fff", fontSize: 16 }}>
                  {stornoActiveItem.orderPersonName || "Gost"}
                </div>
                <div style={{ color: "#b2dfdb", marginTop: 4 }}>
                  Iznos: <b>{formatMoney(parsePrice(stornoActiveItem.totalPrice))}</b>
                </div>
                {stornoActiveItem.razlog && (
                  <div style={{ color: "#ffcdd2", fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
                    Razlog: {stornoActiveItem.razlog}
                  </div>
                )}
              </div>
            )}
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, maxWidth: 360 }}>
              Molimo sačekajte, ne zatvarajte stranicu dok se proces ne završi.
            </div>
          </div>
        )}

        {/* Floating Error Alert */}
        {stornoAlertMsg && (
          <div
            role="alert"
            style={{
              position: "fixed",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1900,
              background: "#b71c1c",
              color: "white",
              padding: "14px 24px",
              borderRadius: 14,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              fontSize: 14,
              fontWeight: 700,
              maxWidth: "90vw",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span>⚠</span>
            <span>{stornoAlertMsg}</span>
            <button
              onClick={() => setStornoAlertMsg("")}
              style={{ background: "transparent", border: "none", color: "white", cursor: "pointer", fontWeight: 900, fontSize: 16, marginLeft: 8 }}
            >
              ✕
            </button>
          </div>
        )}
      </main>
    );
  }

  // ── Render: Waiter list ────────────────────────────────────
  return (
    <main style={{ minHeight: "100vh", padding: "22px 16px 48px", background: "#f4f7f6", color: "#17231f", fontFamily: "Inter,system-ui,sans-serif" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        
        <header style={{ background: "#fff", border: "1px solid #e2eae6", borderRadius: 18, padding: 20, marginBottom: 14, boxShadow: "0 8px 24px #173d310b" }}>
          <div style={{ color: "#547268", fontSize: 12, fontWeight: 800, letterSpacing: ".08em" }}>PREGLED ZARADE</div>
          <h1 style={{ margin: "6px 0 4px", fontSize: 25 }}>Konobari</h1>
          <div style={{ color: "#718078", fontSize: 14 }}>Ukupna zarada od poslednjeg reseta</div>
          <div style={{ marginTop: 12, fontSize: 25, fontWeight: 850, color: "#176b55" }}>{formatMoney(total)}</div>
        </header>
        {error && <div role="alert" style={{ background: "#fff0ef", color: "#982e2a", padding: 13, borderRadius: 12, marginBottom: 12 }}>{error}</div>}
        <section style={{ display: "grid", gap: 10 }}>
          {loading
            ? <div style={{ background: "white", padding: 18, borderRadius: 14 }}>Učitavam podatke…</div>
            : earnings.length === 0
              ? <div style={{ background: "white", padding: 18, borderRadius: 14 }}>Nema završenih narudžbi od poslednjeg reseta.</div>
              : earnings.map((waiter) => (
                <article
                  key={waiter.userId}
                  onClick={() => openWaiter(waiter)}
                  style={{
                    background: "white", border: "1px solid #e2eae6", borderRadius: 14,
                    padding: "15px 17px", display: "flex", justifyContent: "space-between",
                    gap: 12, alignItems: "center", boxShadow: "0 5px 16px #173d3109",
                    cursor: "pointer", transition: "box-shadow .15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = "0 8px 24px #173d3118"}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = "0 5px 16px #173d3109"}
                >
                  <div>
                    <strong style={{ fontSize: 16 }}>{waiter.name}</strong>
                    <div style={{ fontSize: 12, color: "#718078", marginTop: 2 }}>Klikni za detalje →</div>
                  </div>
                  <strong style={{ color: "#176b55", whiteSpace: "nowrap", fontSize: 17 }}>{formatMoney(waiter.total)}</strong>
                </article>
              ))
          }
        </section>
      </div>

        {stornoSuccess && (
          <div className="animate-fadeIn" style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,.88)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div className="animate-checkCircle" style={{ width: 120, height: 120, borderRadius: "50%", background: "linear-gradient(135deg,#ffb100,#ff7a00)", display: "flex", justifyContent: "center", alignItems: "center", boxShadow: "0 0 60px rgba(255,145,0,.55)", margin: "0 auto" }}>
                <svg width="70" height="70" viewBox="0 0 52 52" fill="none"><path d="M14 27 L22 35 L39 16" stroke="black" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="animate-drawCheck" /></svg>
              </div>
              <h1 style={{ marginTop: 30, color: "white", fontSize: "clamp(24px, 7vw, 42px)", fontWeight: 900 }}>Račun storniran</h1>
            </div>
          </div>
        )}

        {/* Full-screen Frozen Storno Overlay */}
        {stornoWorking && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1800,
              background: "rgba(10, 26, 20, 0.88)",
              backdropFilter: "blur(10px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              color: "white",
              textAlign: "center",
              userSelect: "none",
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                border: "5px solid rgba(255,255,255,0.2)",
                borderTopColor: "#ff9100",
                borderRadius: "50%",
                animation: "spin 0.9s linear infinite",
                marginBottom: 22,
              }}
            />
            <h2 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 850, letterSpacing: "-0.01em" }}>
              Storniranje
            </h2>
            <div style={{ color: "#ffb74d", fontSize: 17, fontWeight: 750, marginBottom: 14 }}>
              Sačekajte...
            </div>
            {stornoStage && stornoStage !== "Sačekajte..." && (
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginBottom: 14 }}>
                {stornoStage}
              </div>
            )}
            {stornoActiveItem && (
              <div
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 14,
                  padding: "14px 20px",
                  maxWidth: 440,
                  width: "100%",
                  marginBottom: 18,
                  fontSize: 14,
                  textAlign: "left",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ fontWeight: 800, color: "#fff", fontSize: 16 }}>
                  {stornoActiveItem.orderPersonName || "Gost"}
                </div>
                <div style={{ color: "#b2dfdb", marginTop: 4 }}>
                  Iznos: <b>{formatMoney(parsePrice(stornoActiveItem.totalPrice))}</b>
                </div>
                {stornoActiveItem.razlog && (
                  <div style={{ color: "#ffcdd2", fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
                    Razlog: {stornoActiveItem.razlog}
                  </div>
                )}
              </div>
            )}
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, maxWidth: 360 }}>
              Molimo sačekajte, ne zatvarajte stranicu dok se proces ne završi.
            </div>
          </div>
        )}

        {/* Floating Error Alert */}
        {stornoAlertMsg && (
          <div
            role="alert"
            style={{
              position: "fixed",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1900,
              background: "#b71c1c",
              color: "white",
              padding: "14px 24px",
              borderRadius: 14,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              fontSize: 14,
              fontWeight: 700,
              maxWidth: "90vw",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span>⚠</span>
            <span>{stornoAlertMsg}</span>
            <button
              onClick={() => setStornoAlertMsg("")}
              style={{ background: "transparent", border: "none", color: "white", cursor: "pointer", fontWeight: 900, fontSize: 16, marginLeft: 8 }}
            >
              ✕
            </button>
          </div>
        )}
    </main>
  );
}
