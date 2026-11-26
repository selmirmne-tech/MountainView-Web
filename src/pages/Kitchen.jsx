import React, { useEffect, useRef, useState } from "react";
import { isFirstShift } from "../utils/smjenaManager";
import {
  onValue,
  get,
  child,
  runTransaction,
  update,
} from "firebase/database";

 
import {
  ordersRestoran,
  orderRef,
  globalLockRef,
  totalRestoranRef,
  totalPrvaRef,
  totalDrugaRef,
  completeOrderRef,
  deletedOrderRef,
  deletedOrderPath,
  deletedOrdersRestoran,
  rootRestoran,
  mjeseciRestoran,
  waiterMonthStatistics,
  menuRestoran,
} from "../firebase/refs";
import { sentenceCase } from "./animationText";

import * as N from "../firebase/nodes";

import { ChefHat, Trash2, X } from "lucide-react";




export default function Kitchen() {
	
	
		
	useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

	
	const scrollRef = useRef(null);
const [showTop, setShowTop] = useState(false);
const [showBottom, setShowBottom] = useState(true);
	
	
  const [orders, setOrders] = useState([]);
  const [deletedOrders, setDeletedOrders] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState("food");
  const [showDeletedOrders, setShowDeletedOrders] = useState(false);
  const [kitchenFlash, setKitchenFlash] = useState(false);
  const [barFlash, setBarFlash] = useState(false);
  const knownWebOrdersRef = useRef(new Set());
  const isInitialWebOrdersRef = useRef(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const orderDialogContentRef = useRef(null);
  const selectedOrderId = selectedOrder?.orderId;
  const [toast, setToast] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!selectedOrderId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const content = orderDialogContentRef.current;
      if (content) content.scrollTop = content.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedOrderId]);

  const isProcessingRef = useRef(false);
  const wakeLockRef = useRef(null);
  const lastOrdersRef = useRef("");




const [loadingOrderId, setLoadingOrderId] = useState(null);
const [deletingOrderId, setDeletingOrderId] = useState(null);


  const currentUser =
    JSON.parse(localStorage.getItem("user")) || {};

  const userRole = currentUser?.titula || "";

  useEffect(() => {
    if (userRole === "Sank") {
      setSelectedDepartment("drinks");
    } else {
      setSelectedDepartment("food");
    }
    setShowDeletedOrders(false);
  }, [userRole]);

  const canComplete = !showDeletedOrders && (
    userRole === "Administrator" ||
    (userRole === "Kuhinja" && selectedDepartment === "food") ||
    (userRole === "Sank" && selectedDepartment === "drinks")
  );

  const canDelete = userRole === "Administrator";
const [completedAnimation, setCompletedAnimation] = useState(false);
const [successAnimationTitle, setSuccessAnimationTitle] = useState("Narudžba je izdata");
const [successAnimationType, setSuccessAnimationType] = useState("issued");
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };


    const [now, setNow] = useState(Date.now());

        useEffect(() => {
  const interval = setInterval(() => {
    setNow(Date.now());
  }, 60000); // svake 1 minute

  return () => clearInterval(interval);
}, []);



const handleScroll = () => {

  const el = scrollRef.current;

  if (!el) return;

  const atTop = el.scrollTop <= 10;

  const atBottom =
    el.scrollHeight - el.scrollTop <= el.clientHeight + 10;


  setShowTop(!atTop);
  setShowBottom(!atBottom);

};


const scrollToTop = () => {

  scrollRef.current?.scrollTo({
    top:0,
    behavior:"smooth"
  });

};


const scrollToBottom = () => {

  scrollRef.current?.scrollTo({
    top:scrollRef.current.scrollHeight,
    behavior:"smooth"
  });

};


const vibrate = () => {
  if (navigator.vibrate) {
    navigator.vibrate(80);
  }
};








  const getDepartmentItemNames = (order, department) => {
    if (!order?.name) return "";
    const names = String(order.name).split(/\r?\n/);
    const types = Array.isArray(order.itemTypes) ? order.itemTypes : [];
    const matched = [];
    for (let i = 0; i < names.length; i++) {
      const name = names[i]?.trim();
      if (!name) continue;
      const type = types[i] === "drinks" ? "drinks" : "food";
      if (type === department) {
        matched.push(name);
      }
    }
    return matched.length > 0 ? matched.join("\n") : (order.name || "");
  };

  const sendPushNotification = async (
    userId,
    orderId,
    title = "Narudžba završena",
    body = "Vaša narudžba je spremna!"
  ) => {
    try {
      const tokenRef = child(
        child(child(rootRestoran(), N.USERS_RESTORAN), userId),
        "fcmToken"
      );

      const tokenSnap = await get(tokenRef);
      const token = tokenSnap.val();

      if (!token) {
        console.log("Nema FCM tokena za usera:", userId);
        return;
      }

      const res = await fetch(
        "https://fcm-server-topaz.vercel.app/api/sendOrderNotification",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            title,
            body,
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.log("Push failed:", text);
      }
    } catch (e) {
      console.log("Push error", e);
    }
  };













  const getShift = (hour) =>
    hour >= 5 && hour < 15 ? "PRVA" : "DRUGA";

  const formatDateTime = () => {
    const d = new Date();

    const pad = (n) => String(n).padStart(2, "0");

    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();

    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  };

  const requestWakeLock = async () => {
    try {
      if (!("wakeLock" in navigator)) return;

      wakeLockRef.current?.release?.();

      wakeLockRef.current =
        await navigator.wakeLock.request("screen");

      wakeLockRef.current.addEventListener("release", () => {
        wakeLockRef.current = null;
      });
    } catch {}
  };

  useEffect(() => {
    requestWakeLock();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      wakeLockRef.current?.release?.();
    };
  }, []);

  useEffect(() => {
    const unsub = onValue(deletedOrdersRestoran(), (snap) => {
      const archived = [];
      snap.forEach((userSnap) => {
        userSnap.forEach((orderSnap) => {
          const value = orderSnap.val();
          if (!value || typeof value !== "object") return;
          archived.push({
            ...value,
            orderId: value.orderId || orderSnap.key,
            orderById: value.orderById || userSnap.key,
            archived: true,
          });
        });
      });
      archived.sort((a, b) => orderTimestamp(a) - orderTimestamp(b));
      setDeletedOrders(archived);
      setSelectedOrder((current) => current?.archived
        ? archived.find((order) => order.orderId === current.orderId) || null
        : current);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (deletedOrders.length > 0 || !showDeletedOrders) return;
    setShowDeletedOrders(false);
    setSelectedDepartment(userRole === "Sank" ? "drinks" : "food");
    setSelectedOrder(null);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [deletedOrders.length, showDeletedOrders, userRole]);

  const parseCustomTime = (str) => {
    if (!str) return null;

    try {
      const parts = String(str).trim().split(/\s+/);
      if (parts.length < 2) return null;
      const [time, date] = parts;
      const [h, m, s = "00"] = time.split(":");
      const [d, mo, y] = date.split("-");

      if (![h, m, s, d, mo, y].every((part) => /^\d+$/.test(part || ""))) return null;
      const parsed = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(m), Number(s));
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const orderTimestamp = (order) => {
    const timestamp = parseCustomTime(order?.time)?.getTime();
    return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
  };

  const getClockTime = (str) => {
    if (!str) return "";
    return str.split(" ")[0].slice(0, 5);
  };



const getWaitMinutes = (order, nowTs) => {
  const start = parseCustomTime(order.time);

  if (!start) return 0;

  const diff = nowTs - start.getTime();

  if (diff <= 0) return 0;

  return Math.floor(diff / 60000);
};



  const formatName = (text) => {
    if (!text) return "";

    return text
      .split("\n")
      .map((l) => l.trimStart())
      .filter((l) => l.trim() !== "")
      .join("\n");
  };

  const getOrderItems = (order) => {
    const names = String(order?.name || "").split(/\r?\n/);
    const descriptions = String(order?.description || "").split(/\r?\n/);
    const types = Array.isArray(order?.itemTypes) ? order.itemTypes : [];
    return names.map((name, index) => ({
      name: name.trim(),
      description: String(descriptions[index] || "").trim(),
      department: types.length === 0 || types[index] !== "drinks" ? "food" : "drinks",
    })).filter((item) => item.name || item.description);
  };

  const getOrderItemGroups = (order, firstDepartment) => {
    const items = getOrderItems(order);
    const first = firstDepartment === "drinks" ? "drinks" : "food";
    const second = first === "food" ? "drinks" : "food";
    return [first, second].map((department) => ({
      department,
      items: items.filter((item) => item.department === department),
    })).filter((group) => group.items.length > 0);
  };

  const filterOrderForDepartment = (order, department) => {
    if (order?.deleted === true) return null;
    if ((department === "food" && order?.foodCompleted === true) ||
        (department === "drinks" && order?.drinkCompleted === true)) {
      const types = Array.isArray(order?.itemTypes) ? order.itemTypes : [];
      const hasFood = types.length === 0 || types.some((type) => type !== "drinks");
      const hasDrinks = types.some((type) => type === "drinks");
      const allDepartmentsComplete = (!hasFood || order?.foodCompleted === true) &&
        (!hasDrinks || order?.drinkCompleted === true);
      const finalizationDepartment = order?.finalizationDepartment ||
        (hasFood ? "food" : "drinks");
      if (!allDepartmentsComplete || department !== finalizationDepartment) return null;
    }
    const types = Array.isArray(order?.itemTypes) ? order.itemTypes : [];
    const names = String(order?.name || "").split(/\r?\n/);
    const descriptions = String(order?.description || "").split(/\r?\n/);
    const indices = names.map((_, index) => index).filter((index) => {
      const type = types.length === 0 ? "food" : (types[index] === "drinks" ? "drinks" : "food");
      return type === department;
    });
    if (!indices.length) return null;
    return {
      ...order,
      department,
      name: indices.map((index) => names[index]).join("\n"),
      description: indices.map((index) => descriptions[index] || "").join("\n"),
      itemTypes: indices.map((index) => types[index] || "food"),
    };
  };
  
  const parseOrderPrice = (price) => {
    if (typeof price === "number") {
      return Number.isFinite(price) && price >= 0 ? price : null;
    }

    let value = String(price ?? "").trim().replace(/[\s€]/g, "");
    if (!value) return null;

    const comma = value.lastIndexOf(",");
    const dot = value.lastIndexOf(".");
    if (comma !== -1 && dot !== -1) {
      if (comma > dot) {
        value = value.replace(/\./g, "").replace(",", ".");
      } else {
        value = value.replace(/,/g, "");
      }
    } else if (comma !== -1) {
      value = value.replace(",", ".");
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  const formatPrice = (price) => {
    const value = parseOrderPrice(price);
    if (value === null) return "Cijena nije zabilježena";

    return `${value.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} €`;
  };

  useEffect(() => {
    const unsub = onValue(ordersRestoran(), (snap) => {
      const arr = [];

      snap.forEach((c) => {
        const v = c.val();

        if (v?.status === "pending") {
            arr.push({
              ...v,
              orderId: v.orderId || c.key,
              // Cijena se čita iz istog Firebase zapisa i normalizuje odmah
              // zajedno sa ostalim poljima narudžbe.
              displayTotalPrice: parseOrderPrice(v.totalPrice),
            });
        }
      });

      arr.sort((a, b) => {
        return orderTimestamp(a) - orderTimestamp(b);
      });

      const serialized = JSON.stringify(arr);

      console.info("[KITCHEN_ORDERS] snapshot", {
        total: snap.size,
        pending: arr.length,
        readyForFinalization: arr.filter((order) => order.finalizationState === "ready").length,
      });

      if (lastOrdersRef.current === serialized) return;
	  
	  
	  
	  

      lastOrdersRef.current = serialized;

      const currentIds = new Set(arr.map((o) => o.orderId));
      if (isInitialWebOrdersRef.current) {
        knownWebOrdersRef.current = currentIds;
        isInitialWebOrdersRef.current = false;
      } else {
        const newOrders = arr.filter((o) => !knownWebOrdersRef.current.has(o.orderId));
        knownWebOrdersRef.current = currentIds;
        if (newOrders.length > 0) {
          let anyFood = false;
          let anyDrinks = false;
          for (const no of newOrders) {
            const types = Array.isArray(no.itemTypes) ? no.itemTypes : [];
            const hasF = types.length === 0 || types.some((t) => t !== "drinks");
            const hasD = types.some((t) => t === "drinks");
            if (hasF) anyFood = true;
            if (hasD) anyDrinks = true;
          }
          if (anyFood) {
            setKitchenFlash(true);
            setTimeout(() => setKitchenFlash(false), 1000);
            if (userRole === "Kuhinja") {
              setSelectedDepartment("food");
              setShowDeletedOrders(false);
              setSelectedOrder(null);
            }
          }
          if (anyDrinks) {
            setBarFlash(true);
            setTimeout(() => setBarFlash(false), 1000);
            if (userRole === "Sank") {
              setSelectedDepartment("drinks");
              setShowDeletedOrders(false);
              setSelectedOrder(null);
            }
          }
        }
      }

      setOrders(arr);
      setSelectedOrder((current) => {
        if (!current) return current;
        const matching = arr.find((order) => order.orderId === current.orderId);
        if (!matching) return null;
        return current.archived ? matching
          : { ...matching, department: current.department || selectedDepartment };
      });
    }, (error) => {
      console.error("[KITCHEN_ORDERS] Firebase listener cancelled", error);
      showToast("Ne mogu učitati narudžbe iz baze. Provjerite vezu i pristup.");
    });

    return () => unsub();
  }, []);

  const COMPLETION_QUEUE_KEY = "kitchenCompletionQueue";
  const DELETION_QUEUE_KEY = "kitchenDeletionQueue";
  const retryTimerRef = useRef(null);
  const activeCompletionRef = useRef(false);
  const completionRetryAttemptRef = useRef(0);
  const deletionRetryTimerRef = useRef(null);
  const activeDeletionRef = useRef(false);
  const deletionRetryAttemptRef = useRef(0);

  const getWebClientId = () => {
    let id = sessionStorage.getItem("kitchenWebClientId");
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem("kitchenWebClientId", id);
    }
    return id;
  };

  const getCompletionQueue = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(COMPLETION_QUEUE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveCompletionQueue = (queue) =>
    localStorage.setItem(COMPLETION_QUEUE_KEY, JSON.stringify(queue));

  const getDeletionQueue = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(DELETION_QUEUE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveDeletionQueue = (queue) =>
    localStorage.setItem(DELETION_QUEUE_KEY, JSON.stringify(queue));

  const lockTokenFor = (orderId) => `LOCK:${orderId}:WEB:${getWebClientId()}`;
  const uniqueLockAttemptToken = (baseToken) => {
    const attemptId = globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${baseToken}:ATTEMPT:${attemptId}`;
  };
  const LOCK_LEASE_FIELD = "GlobalLockUpdatedAt";
  const LOCK_LEASE_MILLIS = 15 * 1000;

  const acquireOwnedLock = async (lockRef, token) => {
    const lockField = lockRef.key;
    const tx = await runTransaction(lockRef.parent, (current) => {
      const state = current && typeof current === "object" ? current : {};
      const value = state[lockField] == null ? null : String(state[lockField]);
      const leaseAt = Number(state[LOCK_LEASE_FIELD]) || 0;
      const now = Date.now();
      const available = value == null || value.toLowerCase() === "false";
      const owned = value === token;
      const expired = leaseAt > 0 && now - leaseAt > LOCK_LEASE_MILLIS;

      if (available || owned || expired) {
        return { ...state, [lockField]: token, [LOCK_LEASE_FIELD]: now };
      }
      if (leaseAt === 0) {
        // Start a lease clock for a lock left by an older app version.
        return { ...state, [LOCK_LEASE_FIELD]: now };
      }
      return;
    });
    return tx.committed && tx.snapshot.child(lockField).val() === token;
  };

  const releaseOwnedLock = async (lockRef, token, replacement = "False") => {
    try {
      const lockField = lockRef.key;
      await runTransaction(lockRef.parent, (current) => {
        const state = current && typeof current === "object" ? current : {};
        if (String(state[lockField]) !== token) return;
        return { ...state, [lockField]: replacement, [LOCK_LEASE_FIELD]: null };
      });
    } catch (e) {
      console.warn("Greška pri oslobađanju locka:", e);
    }
  };

  const processDeletionJob = async (job) => {
    const { orderId, userId } = job;
    const token = uniqueLockAttemptToken(`${job.token}:${getWebClientId()}`);
    const globalRef = globalLockRef();
    let lockAcquired = false;
    let lockReleasedByCommit = false;

    try {
      const archivedRef = deletedOrderRef(userId, orderId);
      if ((await get(archivedRef)).exists()) {
        await releaseOwnedLock(globalRef, token, "False").catch(console.error);
        return "done";
      }

      lockAcquired = true;
      if (!(await acquireOwnedLock(globalRef, token))) return "retry";

      const claim = await runTransaction(orderRef(orderId), (order) => {
        if (!order || order.orderId !== orderId || order.orderById !== userId ||
            String(order.status || "").toLowerCase() !== "pending" ||
            order.finalizationState === "ready") return undefined;
        return { ...order, deleted: true };
      });
      if (!claim.committed || !claim.snapshot.exists()) {
        return (await get(archivedRef)).exists() ? "done" : "review";
      }

      const updates = {
        [deletedOrderPath(userId, orderId)]: claim.snapshot.val(),
        [`${N.ORDERS_RESTORAN}/${orderId}`]: null,
        [`${N.TRANSACTION_LOCKS_RESTORAN}/${orderId}`]: null,
        [`${N.TOTAL_PRICE_RESTORAN}/${N.GLOBAL_LOCK}`]: "False",
        [`${N.TOTAL_PRICE_RESTORAN}/GlobalLockUpdatedAt`]: null,
      };
      await update(rootRestoran(), updates);
      lockAcquired = false;
      return "done";
    } catch (error) {
      console.error("Greška pri arhiviranju obrisane narudžbe", error);
      return "retry";
    } finally {
      if (lockAcquired && !lockReleasedByCommit) {
        await releaseOwnedLock(globalRef, token, "False").catch(console.error);
      }
    }
  };

  const processNextDeletion = async () => {
    if (activeDeletionRef.current || !canDelete) return;
    clearTimeout(deletionRetryTimerRef.current);
    deletionRetryTimerRef.current = null;
    const queue = getDeletionQueue();
    const job = queue[0];
    if (!job) return;

    activeDeletionRef.current = true;
    setDeletingOrderId(job.orderId);
    const result = await processDeletionJob(job);
    activeDeletionRef.current = false;
    setDeletingOrderId(null);

    if (result === "done" || result === "review") {
      deletionRetryAttemptRef.current = 0;
      saveDeletionQueue(queue.filter((item) => item.orderId !== job.orderId));
      if (result === "done") {
        setSelectedOrder(null);
        setShowDeleteConfirm(false);
        setSuccessAnimationType("deleted");
        setSuccessAnimationTitle("Narudžba je obrisana");
        setCompletedAnimation(true);
        setTimeout(() => setCompletedAnimation(false), 2000);
      } else {
        showToast("Narudžba više nije aktivna ili se podaci ne poklapaju.");
      }
    } else {
      showToast(navigator.onLine
        ? "Arhiviranje će se automatski ponoviti."
        : "Brisanje je sačuvano; čeka internet.");
      clearTimeout(deletionRetryTimerRef.current);
      const delay = Math.min(1000 * (2 ** deletionRetryAttemptRef.current), 10000);
      deletionRetryAttemptRef.current = Math.min(deletionRetryAttemptRef.current + 1, 4);
      deletionRetryTimerRef.current = setTimeout(() => {
        deletionRetryTimerRef.current = null;
        processNextDeletion();
      }, delay);
    }
    if (getDeletionQueue().length > 0 && result !== "retry") processNextDeletion();
  };

  const processCompletionJob = async (job) => {
    const { orderId, userId } = job;
    const token = uniqueLockAttemptToken(`${job.token}:${getWebClientId()}`);
    const department = job.department === "drinks" ? "drinks" : "food";
    const completedField = department === "food" ? "foodCompleted" : "drinkCompleted";
    const globalRef = globalLockRef();
    let globalAttempted = false;
    let locksReleasedByCommit = false;

    try {
      const completedRef = completeOrderRef(userId, orderId);
      if ((await get(completedRef)).exists()) {
        return "done";
      }

      const initialSnap = await get(orderRef(orderId));
      if (!initialSnap.exists() || initialSnap.val()?.deleted === true) {
        if ((await get(completedRef)).exists()) return "done";
        return "not_found";
      }
      const initialOrder = initialSnap.val();
      const initialPrice = Number(String(initialOrder?.totalPrice ?? "").replace(",", "."));
      if (!initialOrder || initialOrder.orderId !== orderId || !initialOrder.orderById ||
          !Number.isFinite(initialPrice) || initialOrder.orderById !== userId) return "review";

      const marked = await runTransaction(orderRef(orderId), (current) => {
        if (!current || current.orderId !== orderId || current.orderById !== userId ||
            String(current.status || "").toLowerCase() !== "pending" || current.deleted === true) return undefined;
        const types = Array.isArray(current.itemTypes) ? current.itemTypes : [];
        const hasFood = types.length === 0 || types.some((type) => type !== "drinks");
        const hasDrinks = types.some((type) => type === "drinks");
        if ((department === "food" && !hasFood) || (department === "drinks" && !hasDrinks)) return undefined;
        current[completedField] = true;
        current[`${department}CompletedBy`] = currentUser?.ime || currentUser?.name || userId;
        if ((!hasFood || current.foodCompleted === true) &&
            (!hasDrinks || current.drinkCompleted === true)) {
          current.finalizationState = "ready";
          current.finalizationDepartment = department;
        }
        return current;
      });
      if (!marked.committed || !marked.snapshot.exists()) {
        if ((await get(completedRef)).exists()) return "done";
        return "review";
      }
      const markedOrder = marked.snapshot.val();
      const markedTypes = Array.isArray(markedOrder.itemTypes) ? markedOrder.itemTypes : [];
      const markedHasFood = markedTypes.length === 0 || markedTypes.some((type) => type !== "drinks");
      const markedHasDrinks = markedTypes.some((type) => type === "drinks");
      if ((markedHasFood && markedOrder.foodCompleted !== true) ||
          (markedHasDrinks && markedOrder.drinkCompleted !== true)) return "partial";

      // Obje stavke su završene - slijedi finalizacija
      globalAttempted = true;
      let lockAcquired = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        if ((await get(completedRef)).exists()) return "done";
        if (await acquireOwnedLock(globalRef, token)) {
          lockAcquired = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (!lockAcquired) {
        if ((await get(completedRef)).exists()) return "done";
        return "retry";
      }

      if ((await get(completedRef)).exists()) {
        await releaseOwnedLock(globalRef, token, "False").catch(console.error);
        locksReleasedByCommit = true;
        return "done";
      }

      const finalSnap = await get(orderRef(orderId));
      if (!finalSnap.exists() || finalSnap.val()?.deleted === true) {
        if ((await get(completedRef)).exists()) {
          await releaseOwnedLock(globalRef, token, "False").catch(console.error);
          locksReleasedByCommit = true;
          return "done";
        }
        await releaseOwnedLock(globalRef, token, "False").catch(console.error);
        return "not_found";
      }
      const finalOrder = finalSnap.val();
      if (!finalOrder || finalOrder.orderId !== orderId || finalOrder.orderById !== userId) {
        await releaseOwnedLock(globalRef, token, "False").catch(console.error);
        return "review";
      }
      const finalTypes = Array.isArray(finalOrder.itemTypes) ? finalOrder.itemTypes : [];
      const hasFood = finalTypes.length === 0 || finalTypes.some((type) => type !== "drinks");
      const hasDrinks = finalTypes.some((type) => type === "drinks");
      if ((hasFood && finalOrder.foodCompleted !== true) ||
          (hasDrinks && finalOrder.drinkCompleted !== true)) {
        await releaseOwnedLock(globalRef, token, "False").catch(console.error);
        const pushTitle = department === "drinks"
          ? "ŠANK je završio narudžbu"
          : "KUHINJA je završila narudžbu";
        const pushBody = getDepartmentItemNames(finalOrder, department);
        sendPushNotification(userId, orderId, pushTitle, pushBody).catch((error) =>
          console.error("Push notifikacija nije poslata", error)
        );
        return "partial";
      }
      const orderPrice = Number(String(finalOrder.totalPrice ?? "").replace(",", "."));
      if (!Number.isFinite(orderPrice) || orderPrice < 0) {
        await releaseOwnedLock(globalRef, token, "False").catch(console.error);
        return "review";
      }

      const now = new Date();
      const yearKey = String(now.getFullYear());
      const monthKey = String(now.getMonth() + 1).padStart(2, "0");
      const dayKey = String(now.getDate()).padStart(2, "0");
      const monthSummaryKey = `${yearKey}-${monthKey}`;
      const dateKey = `${yearKey}/${monthKey}/${dayKey}`;
      const waiterDayRef = child(waiterMonthStatistics(userId, yearKey, monthKey), dayKey);
      const monthStatsRef = child(mjeseciRestoran(), monthSummaryKey);
      const stockDeductions = new Map();
      (Array.isArray(finalOrder.stockItems) ? finalOrder.stockItems : []).forEach((item) => {
        const itemId = String(item?.menuItemId ?? "");
        const quantity = Number(item?.quantity);
        if (/^[A-Za-z0-9_-]+$/.test(itemId) && Number.isInteger(quantity) && quantity > 0) {
          stockDeductions.set(itemId, (stockDeductions.get(itemId) || 0) + quantity);
        }
      });
      const drinksMenuRef = child(menuRestoran(), "Podaci1");
      const stockReadsPromise = Promise.all([...stockDeductions.keys()].map(async (itemId) => {
        const itemSnapshot = await get(child(drinksMenuRef, itemId));
        if (!itemSnapshot.exists()) return null;
        const currentStock = Number(String(itemSnapshot.child("stanje").val() ?? "0").replace(",", "."));
        const safeStock = Number.isFinite(currentStock) ? currentStock : 0;
        return [itemId, safeStock - stockDeductions.get(itemId)];
      }));
      const [totalRestSnap, firstSnap, secondSnap, waiterSnap, monthSnap, stockReads] = await Promise.all([
        get(totalRestoranRef()), get(totalPrvaRef()), get(totalDrugaRef()),
        get(waiterDayRef),
        get(monthStatsRef),
        stockReadsPromise,
      ]);

      const number = (value) => Number(String(value ?? "0").replace(",", ".")) || 0;
      const firstShift = isFirstShift(now);
      const first = number(firstSnap.val()) + (firstShift ? orderPrice : 0);
      const second = number(secondSnap.val()) + (firstShift ? 0 : orderPrice);
      const hour = now.getHours();
      const pad = (n) => String(n).padStart(2, "0");
      const timestamp = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()} ${pad(hour)}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const orderDetails = {
        orderId, user_Id: userId, addittionalInfo: finalOrder.addittionalInfo || "",
        orderPersonName: finalOrder.orderPersonName || "", name: finalOrder.name || "",
        orderCompletedBy: currentUser?.ime || currentUser?.name || "Web Kuhinja",
        description: finalOrder.description || "", totalPrice: finalOrder.totalPrice,
        status: `Complete ${timestamp}`, notificationSatus: "true",
        VrijemeNarucivanja: finalOrder.time || "",
        itemTypes: Array.isArray(finalOrder.itemTypes) ? finalOrder.itemTypes : [],
        stockItems: Array.isArray(finalOrder.stockItems) ? finalOrder.stockItems : [],
        foodCompleted: true, drinkCompleted: true,
      };

      const updates = {
        [`${N.TOTAL_PRICE_RESTORAN}/${N.TOTAL_RESTORAN}`]: (number(totalRestSnap.val()) + orderPrice).toFixed(2),
        [`${N.TOTAL_PRICE_RESTORAN}/${N.TOTAL_PRVA}`]: first.toFixed(2),
        [`${N.TOTAL_PRICE_RESTORAN}/${N.TOTAL_DRUGA}`]: second.toFixed(2),
        [`${N.COMPLETE_ORDERS_RESTORAN}/${userId}/${orderId}`]: orderDetails,
        [`${N.STATISTICS}/${N.KONOBARI}/${userId}/${dateKey}/totalRevenue`]: (number(waiterSnap.val()?.totalRevenue) + orderPrice).toFixed(2),
        [`${N.STATISTICS}/${N.KONOBARI}/${userId}/${dateKey}/totalOrders`]: (number(waiterSnap.val()?.totalOrders) + 1),
        [`${N.STATISTICS}/${N.MJESECI_RESTORAN}/${monthSummaryKey}`]: (number(monthSnap.val()) + orderPrice).toFixed(2),
        [`${N.ORDERS_RESTORAN}/${orderId}`]: null,
        // 🔥 ATOMSKI UPIS SVIH PODATAKA I OSLOBAĐANJE LOCKA U ISTOM MREŽNOM POZIVU
        [`${N.TOTAL_PRICE_RESTORAN}/${N.GLOBAL_LOCK}`]: "False",
        [`${N.TOTAL_PRICE_RESTORAN}/GlobalLockUpdatedAt`]: null,
      };
      stockReads.filter(Boolean).forEach(([itemId, quantity]) => {
        updates[`${N.MENU_RESTORAN}/Podaci1/${itemId}/stanje`] = quantity;
      });
      await update(rootRestoran(), updates);
      locksReleasedByCommit = true;
      sendPushNotification(
        userId,
        orderId,
        "Narudžba završena",
        finalOrder.name || "Vaša narudžba je spremna!"
      ).catch((error) =>
        console.error("Push notifikacija nije poslata", error)
      );
      return "done";
    } catch (error) {
      console.error("Greška pri završavanju narudžbe", error);
      return "retry";
    } finally {
      if (globalAttempted && !locksReleasedByCommit) await releaseOwnedLock(globalRef, token, "False").catch(console.error);
    }
  };

  const processNextCompletion = async () => {
    if (activeCompletionRef.current || !canComplete) return;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    const queue = getCompletionQueue();
    const job = queue[0];
    if (!job) return;
    activeCompletionRef.current = true;
    isProcessingRef.current = true;
    setLoadingOrderId(job.orderId);
    const result = await processCompletionJob(job);
    activeCompletionRef.current = false;
    isProcessingRef.current = false;
    setLoadingOrderId(null);

    if (result === "done" || result === "review" || result === "partial" || result === "not_found") {
      completionRetryAttemptRef.current = 0;
      saveCompletionQueue(queue.filter((item) => item.orderId !== job.orderId));
      if (result === "done") {
        setSelectedOrder(null);
        setShowDeleteConfirm(false);
        setSuccessAnimationType("issued");
        setSuccessAnimationTitle("Narudžba je izdata");
        setCompletedAnimation(true);
        setTimeout(() => setCompletedAnimation(false), 2000);
        showToast("Narudžba završena");
      } else if (result === "partial") {
        setSelectedOrder(null);
        setShowDeleteConfirm(false);
        setSuccessAnimationType("issued");
        setSuccessAnimationTitle("Izdat dio narudžbe");
        setCompletedAnimation(true);
        setTimeout(() => setCompletedAnimation(false), 2000);
      } else if (result === "not_found") {
        setSelectedOrder(null);
        setShowDeleteConfirm(false);
        showToast("Narudžba nije pronađena među aktivnim ni završenim narudžbama.");
      } else {
        setSelectedOrder(null);
        setShowDeleteConfirm(false);
        showToast("Narudžba nije pronađena među aktivnim ni završenim narudžbama.");
      }
    } else {
      showToast(navigator.onLine ? "Obrada će se automatski ponoviti." : "Narudžba je sačuvana; čeka internet.");
      clearTimeout(retryTimerRef.current);
      const delay = Math.min(1000 * (2 ** completionRetryAttemptRef.current), 10000);
      completionRetryAttemptRef.current = Math.min(completionRetryAttemptRef.current + 1, 4);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        processNextCompletion();
      }, delay);
    }
    if (getCompletionQueue().length > 0 && result !== "retry") processNextCompletion();
  };

  const completeOrder = async (orderItem) => {
    if (!canComplete || !orderItem?.orderId || !orderItem?.orderById) return;
    if (!orders.some((o) => o.orderId === orderItem.orderId)) {
      setSelectedOrder(null);
      showToast("Narudžba nije pronađena među aktivnim ni završenim narudžbama.");
      return;
    }
    if (getCompletionQueue().some((job) => job.orderId === orderItem.orderId)) {
      showToast("Narudžba je već na čekanju za završavanje.");
      return;
    }
    const queue = getCompletionQueue();
    queue.push({ orderId: orderItem.orderId, userId: orderItem.orderById,
      department: selectedDepartment, token: lockTokenFor(orderItem.orderId) });
    saveCompletionQueue(queue);
    setLoadingOrderId(orderItem.orderId);
    await processNextCompletion();
  };

  useEffect(() => {
    const resume = () => {
      clearTimeout(retryTimerRef.current);
      clearTimeout(deletionRetryTimerRef.current);
      retryTimerRef.current = null;
      deletionRetryTimerRef.current = null;
      completionRetryAttemptRef.current = 0;
      deletionRetryAttemptRef.current = 0;
      processNextCompletion();
      processNextDeletion();
    };
    resume();
    window.addEventListener("online", resume);
    return () => {
      window.removeEventListener("online", resume);
      clearTimeout(retryTimerRef.current);
      clearTimeout(deletionRetryTimerRef.current);
    };
  }, [canComplete, canDelete]);
 const deleteOrder = async () => {
  if (!selectedOrder) return;
  if (!canDelete) return;
  const order = selectedOrder;
  if (!order.orderId || !order.orderById) {
    showToast("Nedostaju podaci za arhiviranje narudžbe.");
    return;
  }
  if (getDeletionQueue().some((job) => job.orderId === order.orderId) ||
      getCompletionQueue().some((job) => job.orderId === order.orderId)) {
    showToast("Narudžba je već na čekanju za obradu.");
    return;
  }

  const queue = getDeletionQueue();
  const requestId = globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  queue.push({
    orderId: order.orderId,
    userId: order.orderById,
    token: `DELETE:${order.orderId}:WEB:${getWebClientId()}:${requestId}`,
  });
  saveDeletionQueue(queue);
  setDeletingOrderId(order.orderId);
  await processNextDeletion();
};

  const togglePriprema = (e, order) => {
    e.stopPropagation();
    if (!order?.orderId || order.archived) return;
    if (userRole !== "Administrator" && userRole !== "Kuhinja") return;

    const currentVal = String(order.priprema || "0");
    const nextVal = currentVal === "1" ? "0" : "1";

    update(orderRef(order.orderId), { priprema: nextVal }).catch((err) => {
      console.error("[TOGGLE_PRIPREMA] Error:", err);
      showToast("Greška pri ažuriranju statusa pripreme.");
    });
  };


  const isSelected = (id) =>
    selectedOrder?.orderId === id;

  const visibleOrders = showDeletedOrders
    ? deletedOrders
    : orders.map((order) => filterOrderForDepartment(order, selectedDepartment)).filter(Boolean);
  const selectDepartmentTab = (department) => {
    setSelectedDepartment(department);
    setShowDeletedOrders(false);
    setSelectedOrder(null);
    scrollRef.current?.scrollTo({ top: 0 });
  };
  const selectDeletedTab = () => {
    setShowDeletedOrders(true);
    setSelectedOrder(null);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  return (
<div
  style={{
    height: "100vh",
    background: "linear-gradient(90deg, #22c55e, #3b82f6)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  }}
>
   <style>{`@keyframes kitchenOrderSheetIn { from { transform: translateY(28px); opacity: .7; } to { transform: translateY(0); opacity: 1; } }`}</style>
   <div
style={{
    position: "sticky",
    top: 0,
    zIndex: 1000,
    background: "rgba(30,41,59,.92)",
    backdropFilter: "blur(18px)",
    color: "#fff",
    padding: "18px 22px",
    borderRadius: 22,
    marginBottom: 20,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    border: "1px solid rgba(255,255,255,.08)",
    boxShadow: "0 12px 30px rgba(0,0,0,.12)"
}}
>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <ChefHat size={18} />
          <b>{showDeletedOrders ? "Obrisane narudžbe" : selectedDepartment === "drinks" ? "ŠANK (PIĆE)" : "KUHINJA (HRANA)"}</b>
        </div>

        <div
          style={{
            background:"linear-gradient(135deg,#ffb100,#ff8a00)",
             
            borderRadius: 20,
            fontWeight: "bold",
            color: "black",
			padding:"6px 14px",
fontSize:15,
boxShadow:"0 8px 20px rgba(255,153,0,.35)"
          }}
        >
          {visibleOrders.length}
        </div>
      </div>

      {(() => {
        const kitchenCount = orders.map((o) => filterOrderForDepartment(o, "food")).filter(Boolean).length;
        const barCount = orders.map((o) => filterOrderForDepartment(o, "drinks")).filter(Boolean).length;
        const deletedCount = deletedOrders.length;
        const isKitchenActive = !showDeletedOrders && selectedDepartment === "food";
        const isBarActive = !showDeletedOrders && selectedDepartment === "drinks";
        const isDeletedActive = showDeletedOrders;

        return (
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexShrink: 0 }}>
            {/* TAB 1: KUHINJA */}
            <button
              type="button"
              onClick={() => selectDepartmentTab("food")}
              style={{
                flex: 1,
                position: "relative",
                padding: "12px 10px",
                border: kitchenFlash
                  ? "2px solid #f59e0b"
                  : isKitchenActive
                  ? "2px solid #105c49"
                  : "1.5px solid #d1d5db",
                borderRadius: 14,
                fontWeight: 800,
                fontSize: "14px",
                color: kitchenFlash || isKitchenActive ? "#ffffff" : "#1e293b",
                background: kitchenFlash
                  ? "linear-gradient(135deg, #f59e0b, #d97706)"
                  : isKitchenActive
                  ? "linear-gradient(135deg, #105c49, #0d4a3b)"
                  : "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: kitchenFlash
                  ? "0 0 20px rgba(245,158,11,0.7)"
                  : isKitchenActive
                  ? "0 6px 18px rgba(16,92,73,0.3)"
                  : "0 2px 6px rgba(0,0,0,0.04)",
                transition: "all 0.2s ease",
              }}
            >
              <span>Kuhinja</span>
              <span
                style={{
                  position: "absolute",
                  top: 5,
                  right: 6,
                  background: "#e53935",
                  color: "#ffffff",
                  borderRadius: "50%",
                  minWidth: 20,
                  height: 20,
                  fontSize: "11px",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                  boxShadow: "0 2px 6px rgba(229,57,53,0.4)",
                  border: "1.5px solid #ffffff",
                }}
              >
                {kitchenCount}
              </span>
            </button>

            {/* TAB 2: ŠANK */}
            <button
              type="button"
              onClick={() => selectDepartmentTab("drinks")}
              style={{
                flex: 1,
                position: "relative",
                padding: "12px 10px",
                border: barFlash
                  ? "2px solid #f59e0b"
                  : isBarActive
                  ? "2px solid #105c49"
                  : "1.5px solid #d1d5db",
                borderRadius: 14,
                fontWeight: 800,
                fontSize: "14px",
                color: barFlash || isBarActive ? "#ffffff" : "#1e293b",
                background: barFlash
                  ? "linear-gradient(135deg, #f59e0b, #d97706)"
                  : isBarActive
                  ? "linear-gradient(135deg, #105c49, #0d4a3b)"
                  : "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: barFlash
                  ? "0 0 20px rgba(245,158,11,0.7)"
                  : isBarActive
                  ? "0 6px 18px rgba(16,92,73,0.3)"
                  : "0 2px 6px rgba(0,0,0,0.04)",
                transition: "all 0.2s ease",
              }}
            >
              <span>Šank</span>
              <span
                style={{
                  position: "absolute",
                  top: 5,
                  right: 6,
                  background: "#e53935",
                  color: "#ffffff",
                  borderRadius: "50%",
                  minWidth: 20,
                  height: 20,
                  fontSize: "11px",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                  boxShadow: "0 2px 6px rgba(229,57,53,0.4)",
                  border: "1.5px solid #ffffff",
                }}
              >
                {barCount}
              </span>
            </button>

            {/* TAB 3: OTKAZANE */}
            {deletedCount > 0 && (
            <button
              type="button"
              onClick={selectDeletedTab}
              style={{
                flex: 1,
                position: "relative",
                padding: "12px 10px",
                border: isDeletedActive
                  ? "2px solid #b42323"
                  : "1.5px solid #d1d5db",
                borderRadius: 14,
                fontWeight: 800,
                fontSize: "14px",
                color: isDeletedActive ? "#ffffff" : "#991b1b",
                background: isDeletedActive
                  ? "linear-gradient(135deg, #b42323, #991b1b)"
                  : "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: isDeletedActive
                  ? "0 6px 18px rgba(180,35,35,0.3)"
                  : "0 2px 6px rgba(0,0,0,0.04)",
                transition: "all 0.2s ease",
              }}
            >
              <span>Otkazane</span>
              <span
                style={{
                  position: "absolute",
                  top: 5,
                  right: 6,
                  background: "#e53935",
                  color: "#ffffff",
                  borderRadius: "50%",
                  minWidth: 20,
                  height: 20,
                  fontSize: "11px",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                  boxShadow: "0 2px 6px rgba(229,57,53,0.4)",
                  border: "1.5px solid #ffffff",
                }}
              >
                {deletedCount}
              </span>
            </button>
            )}
          </div>
        );
      })()}

    <div
ref={scrollRef}
onScroll={handleScroll}
style={{
  flex: 1,
  overflowY: "auto",
  scrollbarWidth:"none",
  msOverflowStyle:"none",
  display: "flex",
  flexDirection: "column",
  gap: 12,
}}
>
        {visibleOrders.map((order) => (
          <div
            key={order.orderId}
            onClick={() => {
              const sourceOrder = order.archived
                ? order
                : orders.find((source) => source.orderId === order.orderId) || order;
              setSelectedOrder({ ...sourceOrder, department: selectedDepartment });
            }}
          style={{
    background: order.archived ? "#fff0f0" : String(order.priprema) === "1" ? "#fafffb" : "#fff",
    borderRadius: 22,
    padding: 18,
    cursor: "pointer",
    transition: ".25s",
    border: isSelected(order.orderId)
        ? "2px solid #2563eb"
        : order.archived ? "1px solid #ef9a9a" : String(order.priprema) === "1" ? "1.5px solid #86efac" : "1px solid #e6eaf0",
    boxShadow: isSelected(order.orderId)
        ? "0 15px 35px rgba(37,99,235,.18)"
        : String(order.priprema) === "1"
        ? "0 8px 24px rgba(34,197,94,.12)"
        : "0 6px 18px rgba(0,0,0,.05)",
}}
          >
            
  <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  }}
>
  <div
    style={{
      fontSize: 18,
      fontWeight: 700,
      color: "#111827",
    }}
  >
    {order.orderPersonName}
  </div>
  {order.archived && <span style={{ padding: "5px 9px", borderRadius: 99, background: "#b42323", color: "#fff", fontSize: 10, fontWeight: 900, letterSpacing: ".04em" }}>OTKAZANO</span>}
</div>

<div
  style={{
    display: "flex",
    gap: 8,
    marginTop: 10,
    
	flexWrap: "wrap",
	marginBottom: 12,
	
  }}
>
  <span
    style={{
      background: "#eff6ff",
      color: "#2563eb",
      padding: "5px 12px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 700,
    }}
  >
    🕒 {getClockTime(order.time)}
  </span>

   
</div>

{order.addittionalInfo && (
  <div
    style={{
      marginTop: 6,
      fontSize: 12,
     background:"#fff8e6",
border:"1px solid #ffd166",
padding:14,
borderRadius:16,
boxShadow:"0 4px 12px rgba(255,193,7,.15)"
    }}
  >
    <b>Dodatne informacije:</b>
    <br />
    {order.addittionalInfo}
  </div>
)}



           <div
  style={{
    marginTop: 12,   // <-- DODAJ
    whiteSpace: "pre-wrap",
    background:"#f8fafc",
    border:"1px solid #e2e8f0",
    padding:14,
    borderRadius:16,
    fontSize:15,
    lineHeight:1.7,
  }}
>
              {formatName(order.name)}
            </div>
			
			

			
			

            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  padding: "6px 14px",
                  borderRadius: 30,
                  fontWeight: 700,
                  fontSize: 13,
                  background:
                    getWaitMinutes(order, now) > 20
                      ? "#fee2e2"
                      : getWaitMinutes(order, now) > 10
                      ? "#fff7cc"
                      : "#dcfce7",
                  color:
                    getWaitMinutes(order, now) > 20
                      ? "#dc2626"
                      : getWaitMinutes(order, now) > 10
                      ? "#b45309"
                      : "#15803d",
                }}
              >
                ⏱ {getWaitMinutes(order, now)} min čekanja
              </div>

              {!order.archived && (userRole === "Administrator" || userRole === "Kuhinja") && (
                <button
                  type="button"
                  onClick={(e) => togglePriprema(e, order)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 15px",
                    borderRadius: 14,
                    border: 0,
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all .2s ease",
                    color: "#fff",
                    background:
                      String(order.priprema) === "1" ? "#147d5b" : "#2757be",
                    boxShadow:
                      String(order.priprema) === "1"
                        ? "0 4px 12px rgba(20,125,91,.25)"
                        : "0 4px 12px rgba(39,87,190,.25)",
                  }}
                >
                  {String(order.priprema) === "1" ? "✓ U pripremi" : "▶ Počni pripremu"}
                </button>
              )}
            </div>

<div
  style={{
    marginTop: 14,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #bbf7d0",
    background: "#f0fdf4",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  }}
>
  <span style={{ color: "#166534", fontSize: 14, fontWeight: 800 }}>
    Ukupno:
  </span>
  <span
    style={{
      color: "#15803d",
      fontSize: 19,
      fontWeight: 900,
      textAlign: "right",
    }}
  >
    {formatPrice(order.displayTotalPrice)}
  </span>
</div>
          </div>
        ))}
      </div>

      {selectedOrder && (
        <div
          onClick={() => {
if (loadingOrderId !== null || deletingOrderId !== null) return;

  setSelectedOrder(null);
  setShowDeleteConfirm(false);
}}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "0 12px 12px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
            background: "#fff",
            width: "100%",
            maxWidth: 560,
            maxHeight: "calc(100dvh - 112px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: 24,
            boxShadow: "0 20px 50px rgba(0,0,0,.18)",
            animation: "kitchenOrderSheetIn 220ms ease-out",
            }}
          >
            <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>
                {selectedOrder.orderPersonName}
              </h3>
              <button
                type="button"
                aria-label="Zatvori narudžbu"
                onClick={() => {
                  if (loadingOrderId !== null || deletingOrderId !== null) return;
                  vibrate();
                  setSelectedOrder(null);
                  setShowDeleteConfirm(false);
                }}
                disabled={loadingOrderId !== null || deletingOrderId !== null}
                style={{ flex: "0 0 auto", width: 42, height: 42, display: "grid", placeItems: "center", border: "1px solid #e5e7eb", borderRadius: 12, background: "#f9fafb", color: "#374151", cursor: loadingOrderId !== null || deletingOrderId !== null ? "not-allowed" : "pointer" }}
              >
                <X size={22} />
              </button>
            </div>

            <div ref={orderDialogContentRef} style={{ minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: 20 }}>
			
			
					{selectedOrder.addittionalInfo && (
  <div
    style={{
      marginTop: 10,
      background: "#fff3cd",
      padding: 10,
      borderRadius: 10,
      whiteSpace: "pre-wrap",
      fontSize: 13,
    }}
  >
    <b>Dodatne informacije:</b>
    <div style={{ marginTop: 4 }}>
      {selectedOrder.addittionalInfo}
    </div>
  </div>
)}

            <div style={{ marginTop: 14 }}>
              <div style={{ margin: "0 0 8px 2px", color: "#64748b", fontSize: 11, fontWeight: 800, letterSpacing: ".1em" }}>NARUČENI ARTIKLI</div>
              <div style={{ display: "grid", gap: 10 }}>
                {getOrderItemGroups(selectedOrder, selectedOrder.department || selectedDepartment).map((group) => {
                  const isIssued = group.department === "food"
                    ? selectedOrder?.foodCompleted === true
                    : selectedOrder?.drinkCompleted === true;

                  return (
                    <section key={group.department} style={{ display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 0 0 2px" }}>
                        <span style={{ color: "#38594d", fontSize: 12, fontWeight: 900, letterSpacing: ".08em" }}>
                          {group.department === "food" ? "HRANA" : "PIĆE"}
                        </span>
                        {isIssued && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              fontSize: 10,
                              fontWeight: 900,
                              letterSpacing: ".06em",
                              color: "#166534",
                              background: "#dcfce7",
                              border: "1.5px solid #22c55e",
                              borderRadius: 6,
                              padding: "2px 7px",
                              lineHeight: 1.2,
                              boxShadow: "0 1px 2px rgba(22,101,52,0.12)",
                              transform: "rotate(-2deg)",
                            }}
                          >
                            ✓ IZDATO
                          </span>
                        )}
                      </div>
                      {group.items.map((item, index) => (
                        <div key={`${group.department}-${index}-${item.name}`} style={{ padding: "11px 13px", border: "1px solid #e2eae6", borderRadius: 12, background: "#f8fbf9" }}>
                          {item.name && <div style={{ color: "#173c32", fontSize: 15, fontWeight: 800, lineHeight: 1.35 }}>{item.name}</div>}
                          {item.description && <div style={{ marginTop: 4, color: "#64736c", fontSize: 13, lineHeight: 1.45 }}>{item.description}</div>}
                        </div>
                      ))}
                    </section>
                  );
                })}
              </div>
            </div>
			
			
	
			

            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                opacity: 0.7,
              }}
            >
              Vrijeme narudžbe:{" "}
              {getClockTime(selectedOrder.time)}
            </div>
			
			
			
			{/* UKUPNO ZA NAPLATU */}
<div
  style={{
    marginTop: 18,
    marginBottom: 10,
    padding: 16,
    borderRadius: 16,
    background: "#dcfce7",
    border: "1px solid #86efac",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  }}
>
  <span
    style={{
      fontSize: 16,
      fontWeight: 800,
      color: "#166534",
    }}
  >
    Ukupno za naplatu:
  </span>

  <span
    style={{
      fontSize: 24,
      fontWeight: 900,
      color: "#15803d",
      whiteSpace: "nowrap",
    }}
  >
    {formatPrice(selectedOrder.displayTotalPrice)}
  </span>
</div>

          <button
  onClick={() => {
    if (
      !canComplete ||
      loadingOrderId === selectedOrder.orderId
    )
      return;

    vibrate();
    completeOrder(selectedOrder);
  }}
  disabled={
    !canComplete ||
    loadingOrderId === selectedOrder.orderId
  }
  style={{
    width: "100%",
    marginTop: 10,
    padding: 12,
    background: "blue",
    color: "white",
    borderRadius: 10,
    display: selectedOrder.archived ? "none" : "block",
    opacity:
      loadingOrderId === selectedOrder.orderId ? 0.7 : 1,
    cursor:
      loadingOrderId === selectedOrder.orderId
        ? "not-allowed"
        : "pointer",
  }}
>
  {loadingOrderId === selectedOrder.orderId ? (
    <span
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          border: "2px solid white",
          borderTop: "2px solid transparent",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      Obrada...
    </span>
  ) : (
    "Završi narudžbu"
  )}
</button>

           <button
  onClick={() => {
    if (!canDelete) return;

    vibrate();
    setShowDeleteConfirm(true);
  }}
  disabled={!canDelete}
  style={{
    width: "100%",
    marginTop: 10,
    padding: 12,
    background: "red",
    color: "white",
    borderRadius: 10,
    display: selectedOrder.archived ? "none" : "block",
    opacity: !canDelete ? 0.5 : 1,
    cursor: !canDelete ? "not-allowed" : "pointer",
  }}
>
  Obriši narudžbu
</button>

            {showDeleteConfirm && !selectedOrder.archived && (
              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    textAlign: "center",
                    marginBottom: 10,
                  }}
                >
                  Da li ste sigurni?
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                  }}
                >
               <button
  onClick={() => {
    if (deletingOrderId) return;

    vibrate();
    deleteOrder();
  }}
  disabled={deletingOrderId}
  style={{
    flex: 1,
    padding: 12,
    background: "green",
    color: "white",
    opacity: deletingOrderId ? 0.6 : 1,
    cursor: deletingOrderId ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  }}
>
  {deletingOrderId ? (
    <>
      <div
        style={{
          width: 14,
          height: 14,
          border: "2px solid white",
          borderTop: "2px solid transparent",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      Brišem...
    </>
  ) : (
    "Da"
  )}
</button>

                 <button
  onClick={() => {
    if (deletingOrderId) return;

    vibrate();
    setShowDeleteConfirm(false);
  }}
  disabled={deletingOrderId}
  style={{
    flex: 1,
    padding: 12,
    background: "red",
    color: "white",
    opacity: deletingOrderId ? 0.6 : 1,
    cursor: deletingOrderId ? "not-allowed" : "pointer",
  }}
>
  Ne
</button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}


{completedAnimation && (
 <div
className="animate-fadeIn"
style={{
  position: "fixed",
  inset:0,
  zIndex:9999,
  background:"rgba(0,0,0,.88)",
  backdropFilter:"blur(12px)",
  display:"flex",
  alignItems:"center",
  justifyContent:"center",
}}
>
    <div
      style={{
        textAlign: "center",
         
      }}
    >
      <div
	  className="animate-checkCircle"
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: successAnimationType === "deleted"
            ? "linear-gradient(135deg,#f87171,#b91c1c)"
            : "linear-gradient(135deg,#ffb100,#ff7a00)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          boxShadow: successAnimationType === "deleted"
            ? "0 0 60px rgba(239,68,68,.5)"
            : "0 0 60px rgba(255,145,0,.55)",
          margin: "0 auto",
		  
        }}
      >
        {successAnimationType === "deleted" ? (
          <Trash2 size={48} color="white" strokeWidth={2.5} className="animate-fadeIn" />
        ) : (
          <svg width="70" height="70" viewBox="0 0 52 52" fill="none">
            <path
              d="M14 27 L22 35 L39 16"
              stroke="black"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-drawCheck"
            />
          </svg>
        )}
      </div>

      <h1
	   
        style={{
          marginTop: 30,
          color: "white",
          fontSize: "clamp(24px, 7vw, 42px)",
          fontWeight: 900,
		   
        }}
      >
        {sentenceCase(successAnimationTitle)}
      </h1>

    </div>
  </div>
)}


<div
style={{
  position:"fixed",
  inset:0,
  pointerEvents:"none",
  zIndex:1000
}}
>

{showTop && !selectedOrder && (

<button
onClick={scrollToTop}
style={{
  position:"absolute",
  top:110,
  right:20,

  width:45,
  height:45,

  borderRadius:"50%",
  border:"none",

  background:"linear-gradient(135deg,#3b82f6,#2563eb)",
  color:"white",

  fontSize:24,
  fontWeight:"900",

  boxShadow:"0 8px 25px rgba(0,0,0,.35)",

  cursor:"pointer",

  pointerEvents:"auto",

  display:"flex",
  alignItems:"center",
  justifyContent:"center"
}}
>
↑
</button>


)}



{showBottom && !selectedOrder && (
 
 
<button
onClick={scrollToBottom}
style={{
  position:"absolute",
  bottom:20,
  right:20,

  width:45,
  height:45,

  borderRadius:"50%",
  border:"none",

  background:"linear-gradient(135deg,#3b82f6,#2563eb)",
  color:"white",

  fontSize:24,
  fontWeight:"900",

  boxShadow:"0 8px 25px rgba(0,0,0,.35)",

  cursor:"pointer",

  pointerEvents:"auto",

  display:"flex",
  alignItems:"center",
  justifyContent:"center"
}}
>
↓
</button>

 

)}


</div>


      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "black",
            color: "white",
            padding: 10,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
