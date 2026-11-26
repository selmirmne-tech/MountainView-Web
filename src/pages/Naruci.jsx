import { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { child, get, onValue, runTransaction } from "firebase/database";
import { completeOrderRef, menuRestoran, ordersRestoran } from "../firebase/refs";
import * as N from "../firebase/nodes";
import CartModal from "../components/CartModal";
import { Check, Mic, Minus, Plus, RotateCcw, X } from "lucide-react";
import { displayVoiceTranscript, inferVoiceQuantity, resolveVoiceOrder } from "../utils/voiceOrder";

const MENU_CACHE_KEY = "restoran_menu";
const MENU_DATE_KEY = "restoran_menu_date";
const MENU_DISPLAY_CACHE_KEY = "restoran_menu_display";
const menuVersion = (value) => {
  const match = String(value || "").match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
  return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime() : 0;
};

const makeOrderId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (bytes.some((value) => value !== 0)) {
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

const waitForBrowserOnline = () => new Promise((resolve) => {
  if (navigator.onLine) {
    resolve();
    return;
  }
  const onOnline = () => {
    if (!navigator.onLine) return;
    window.removeEventListener("online", onOnline);
    resolve();
  };
  window.addEventListener("online", onOnline);
  // Close the small race where connectivity returned while the listener was added.
  if (navigator.onLine) onOnline();
});

const isTemporaryNetworkError = (error) => {
  if (!navigator.onLine) return true;
  const text = `${error?.code || ""} ${error?.message || error || ""}`.toLowerCase();
  return /network|offline|disconnected|unavailable|timed? ?out|timeout/.test(text);
};

const sameOrderPayload = (existing, intended) => {
  if (!existing || existing.orderId !== intended.orderId ||
      existing.orderById !== intended.orderById) return false;
  const fields = ["orderPersonName", "totalPrice", "name", "description", "addittionalInfo", "status"];
  if (fields.some((field) => String(existing[field] ?? "") !== String(intended[field] ?? ""))) return false;
  return JSON.stringify(existing.itemTypes || []) === JSON.stringify(intended.itemTypes || []);
};

const readCurrentMenu = (data, menuNode = "Podaci") => {
  if (data?.[menuNode] && typeof data[menuNode] === "object") {
    return { items: data[menuNode], version: String(data.createAtMillis || data.createAt || "flat-menu"), createAt: String(data.createAt || "") };
  }
  if (menuNode === "Podaci1") return { items: {}, version: String(data?.createAtMillis || data?.createAt || "empty"), createAt: String(data?.createAt || "") };
  const dated = Object.entries(data || {})
    .filter(([key, value]) => key !== "createAt" && key !== "createAtMillis" && value?.Podaci)
    .sort(([a], [b]) => menuVersion(b) - menuVersion(a));
  if (!dated.length) return { items: {}, version: "empty", createAt: "" };
  return { items: dated[0][1].Podaci, version: dated[0][0], createAt: dated[0][0] };
};

export default function Naruci() {
const navigate = useNavigate();
  const [menu, setMenu] = useState([]);
  const [menuType, setMenuType] = useState("food");
  const [menuTypeScrollReset, setMenuTypeScrollReset] = useState(0);
  const [loading, setLoading] = useState(true);

  // samo selekcija artikala
  const [selectedItems, setSelectedItems] = useState([]);

  const [category, setCategory] = useState("All");

  const [showCart, setShowCart] = useState(false);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [voiceSuggestions, setVoiceSuggestions] = useState(null);
  const [voiceSelectedCandidateId, setVoiceSelectedCandidateId] = useState(null);
  const [voiceCandidateQuantities, setVoiceCandidateQuantities] = useState({});
  const [voiceSuccess, setVoiceSuccess] = useState([]);

  // prava korpa se kreira tek kad se otvori modal
  const [cart, setCart] = useState({});

  const [note, setNote] = useState("");
  
  const [sending, setSending] = useState(false);
const [seconds, setSeconds] = useState(0);

const [ordered, setOrdered] = useState(false);

  const user = JSON.parse(localStorage.getItem("user"));


const categoryRef = useRef(null);
const resetMenuTypeScrollRef = useRef(false);
const cartHistoryOpenRef = useRef(false);
const allMenuRef = useRef([]);
const displayFlagsRef = useRef({ food: true, drinks: true });
const speechRecognitionRef = useRef(null);
const voiceTranscriptRef = useRef("");
const voiceRecognitionErrorRef = useRef("");
const voiceRetryTimerRef = useRef(null);
const voiceSuccessTimerRef = useRef(null);
const voiceCanceledRef = useRef(false);
const voiceAudioContextRef = useRef(null);
const sendingGuardRef = useRef(false);
const pendingOrderAttemptRef = useRef(null);

useEffect(() => () => {
  window.clearTimeout(voiceRetryTimerRef.current);
  window.clearTimeout(voiceSuccessTimerRef.current);
  speechRecognitionRef.current?.abort?.();
  voiceAudioContextRef.current?.close?.();
}, []);

 

const saveMenuCache=(menu,date)=>{

  localStorage.setItem(
    MENU_CACHE_KEY,
    JSON.stringify(menu)
  );

  localStorage.setItem(
    MENU_DATE_KEY,
    date
  );

};







const getMenuCache=()=>{

  const data =
    localStorage.getItem(MENU_CACHE_KEY);

  if(!data)
    return null;


  return JSON.parse(data);

};


  // ==========================
  // LOAD MENU
  // ==========================

useEffect(() => {
  const handleBack = () => {
    if (cartHistoryOpenRef.current) {
      cartHistoryOpenRef.current = false;
      setShowCart(false);
      return;
    }

    navigate("/dashboard", { replace: true });
  };

  window.addEventListener("popstate", handleBack);

  return () => {
    window.removeEventListener("popstate", handleBack);
  };
}, [navigate]);
 
 
 
useEffect(() => {
  let mounted = true;
  let syncing = false;
  let queuedVersion = null;
  let unsubscribeFoodFlag = () => {};
  let unsubscribeDrinksFlag = () => {};
  let unsubscribeVersion = () => {};
  let unsubscribeCreateAt = () => {};
  const liveFlagRevision = { food: 0, drinks: 0 };
  const liveFlagValues = { food: null, drinks: null };
  const menuRef = menuRestoran();
  let cached = null;
  try { cached = getMenuCache(); } catch { cached = null; }
  const lastVersion = { current: localStorage.getItem(MENU_DATE_KEY) };

  try {
    allMenuRef.current = (cached || []).map((item) => {
      const type = item.menuType || "food";
      const sourceId = item.sourceId || String(item.id).replace(/^(food|drinks):/, "");
      return { ...item, sourceId, menuType: type, id: `${type}:${sourceId}` };
    });
  } catch { allMenuRef.current = []; }
  try {
    const savedFlags = JSON.parse(localStorage.getItem(MENU_DISPLAY_CACHE_KEY) || "null");
    displayFlagsRef.current = savedFlags && typeof savedFlags === "object"
      ? { food: savedFlags.food !== false, drinks: savedFlags.drinks !== false }
      : {
        food: allMenuRef.current.some((item) => item.menuType === "food"),
        drinks: allMenuRef.current.some((item) => item.menuType === "drinks"),
      };
  } catch {
    displayFlagsRef.current = {
      food: allMenuRef.current.some((item) => item.menuType === "food"),
      drinks: allMenuRef.current.some((item) => item.menuType === "drinks"),
    };
  }
  let lastSyncedDisplayFlags = { ...displayFlagsRef.current };

  const applyVisibleMenu = () => {
    if (!mounted) return;
    const list = allMenuRef.current.filter((item) =>
      item.menuType === "food" ? displayFlagsRef.current.food : displayFlagsRef.current.drinks);
    setMenu(list);
    const currentItems = new Map(list.map((item) => [item.id, item]));
    setSelectedItems((current) => current.filter((id) => currentItems.has(id)));
    setCart((current) => Object.fromEntries(Object.entries(current)
      .filter(([id]) => currentItems.has(id))
      .map(([id, cartItem]) => [id, { ...currentItems.get(id), qty: cartItem.qty }])));
    const hasFood = list.some((item) => item.menuType === "food");
    const hasDrinks = list.some((item) => item.menuType === "drinks");
    if (hasDrinks && !hasFood) { setMenuType("drinks"); setCategory("All"); }
    else if (hasFood && !hasDrinks) { setMenuType("food"); setCategory("All"); }
    try { localStorage.setItem(MENU_DISPLAY_CACHE_KEY, JSON.stringify(displayFlagsRef.current)); }
    catch { /* The live menu remains available if browser storage is disabled. */ }
  };

  applyVisibleMenu();
  if (allMenuRef.current.length) setLoading(false);

  const syncMenu = async (version) => {
    if (!mounted) return;
    if (syncing) { queuedVersion = version; return; }
    syncing = true;
    try {
      const [foodFlagSnapshot, drinksFlagSnapshot] = await Promise.all([
        get(child(menuRef, N.MENU_SHOW_FOOD)),
        get(child(menuRef, N.MENU_SHOW_DRINKS)),
      ]);
      if (!mounted) return;
      const foodFlag = typeof foodFlagSnapshot.val() === "boolean" ? foodFlagSnapshot.val() : null;
      const drinksFlag = typeof drinksFlagSnapshot.val() === "boolean" ? drinksFlagSnapshot.val() : null;
      const latestFoodFlag = () => liveFlagRevision.food > 0 ? liveFlagValues.food : foodFlag;
      const latestDrinksFlag = () => liveFlagRevision.drinks > 0 ? liveFlagValues.drinks : drinksFlag;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const explicitlyAllOff = (latestFoodFlag() === false && latestDrinksFlag() === false)
        || (offline && !displayFlagsRef.current.food && !displayFlagsRef.current.drinks);

      if (explicitlyAllOff) {
        displayFlagsRef.current = { food: false, drinks: false };
        applyVisibleMenu();
        lastSyncedDisplayFlags = { food: false, drinks: false };
        if (version) {
          lastVersion.current = version;
          saveMenuCache(allMenuRef.current, version);
        }
        setLoading(false);
      } else if (version && lastVersion.current === version && allMenuRef.current.length) {
        displayFlagsRef.current = {
          food: latestFoodFlag() ?? (offline ? displayFlagsRef.current.food : allMenuRef.current.some((item) => item.menuType === "food")),
          drinks: latestDrinksFlag() ?? (offline ? displayFlagsRef.current.drinks : allMenuRef.current.some((item) => item.menuType === "drinks")),
        };
        applyVisibleMenu();
        lastSyncedDisplayFlags = { ...displayFlagsRef.current };
        setLoading(false);
      } else {
        const [foodSnapshot, drinksSnapshot] = await Promise.all([
          get(child(menuRef, N.MENU_PODACI)),
          get(child(menuRef, "Podaci1")),
        ]);
        if (!mounted) return;
        let legacyFood = {};
        let legacyDrinks = {};
        if (!foodSnapshot.exists() && foodFlag !== false) {
          const rootSnapshot = await get(menuRef);
          if (!mounted) return;
          const parsedFood = readCurrentMenu(rootSnapshot.exists() ? rootSnapshot.val() : {}, "Podaci");
          const parsedDrinks = readCurrentMenu(rootSnapshot.exists() ? rootSnapshot.val() : {}, "Podaci1");
          legacyFood = parsedFood.items || {};
          legacyDrinks = parsedDrinks.items || {};
        }
        const foodItems = foodSnapshot.exists() ? foodSnapshot.val() || {} : legacyFood;
        const drinksItems = drinksSnapshot.exists() ? drinksSnapshot.val() || {} : legacyDrinks;
        const allItems = [
          ...Object.entries(foodItems).map(([sourceId, item]) => ({ ...item, id: `food:${sourceId}`, sourceId, menuType: "food" })),
          ...Object.entries(drinksItems).map(([sourceId, item]) => ({ ...item, id: `drinks:${sourceId}`, sourceId, menuType: "drinks" })),
        ];
        displayFlagsRef.current = {
          food: latestFoodFlag() ?? Object.keys(foodItems).length > 0,
          drinks: latestDrinksFlag() ?? Object.keys(drinksItems).length > 0,
        };
        const displaySettingsChanged = displayFlagsRef.current.food !== lastSyncedDisplayFlags.food
          || displayFlagsRef.current.drinks !== lastSyncedDisplayFlags.drinks;
        allMenuRef.current = allItems;
        applyVisibleMenu();
        saveMenuCache(allItems, version || "empty");
        if (lastVersion.current && lastVersion.current !== version && !displaySettingsChanged) {
          const dateSnapshot = await get(child(menuRef, N.MENU_CREATE_AT));
          if (!mounted) return;
          const createAt = String(dateSnapshot.val() || "");
          alert(`Novi meni je preuzet!${createAt ? `\n${createAt}` : ""}`);
        }
        lastSyncedDisplayFlags = { ...displayFlagsRef.current };
        lastVersion.current = version || "empty";
        setLoading(false);
      }
    } catch (error) {
      if (!mounted) return;
      console.error("MENU LOAD ERROR:", error);
      if (!allMenuRef.current.length) setMenu([]);
      setLoading(false);
    } finally {
      syncing = false;
      if (mounted && queuedVersion && queuedVersion !== lastVersion.current) {
        const nextVersion = queuedVersion;
        queuedVersion = null;
        syncMenu(nextVersion);
      }
    }
  };

  const subscribeFlag = (node, isFood) => onValue(child(menuRef, node), (snapshot) => {
    if (!mounted) return;
    const value = snapshot.val();
    const enabled = typeof value === "boolean" ? value
      : (typeof navigator !== "undefined" && navigator.onLine === false
        ? displayFlagsRef.current[isFood ? "food" : "drinks"]
        : allMenuRef.current.some((item) => item.menuType === (isFood ? "food" : "drinks")));
    const flagKey = isFood ? "food" : "drinks";
    liveFlagRevision[flagKey] += 1;
    liveFlagValues[flagKey] = enabled;
    displayFlagsRef.current = { ...displayFlagsRef.current, [isFood ? "food" : "drinks"]: enabled };
    lastSyncedDisplayFlags = { ...displayFlagsRef.current };
    applyVisibleMenu();
    // If the guest has no local menu yet (for example, both types were disabled
    // on first visit), enabling either type must load the current menu once.
    if (enabled && allMenuRef.current.length === 0) syncMenu(lastVersion.current);
  }, (error) => console.error("MENU DISPLAY SETTING ERROR:", error));
  unsubscribeFoodFlag = subscribeFlag(N.MENU_SHOW_FOOD, true);
  unsubscribeDrinksFlag = subscribeFlag(N.MENU_SHOW_DRINKS, false);

  get(child(menuRef, N.MENU_CREATE_AT_MILLIS)).then((initialVersion) => {
    if (!mounted) return;
    if (Number(initialVersion.val()) > 0) {
      unsubscribeVersion = onValue(child(menuRef, N.MENU_CREATE_AT_MILLIS), (snapshot) => {
        syncMenu(String(Number(snapshot.val()) || "empty"));
      }, (error) => console.error("MENU VERSION ERROR:", error));
    } else {
      unsubscribeVersion = onValue(child(menuRef, N.MENU_CREATE_AT), (snapshot) => {
        syncMenu(String(snapshot.val() || "empty"));
      }, (error) => console.error("MENU VERSION ERROR:", error));
    }
  }).catch((error) => {
    if (!mounted) return;
    console.error("MENU VERSION ERROR:", error);
    unsubscribeVersion = onValue(child(menuRef, N.MENU_CREATE_AT_MILLIS), (snapshot) => {
      syncMenu(String(Number(snapshot.val()) || "empty"));
    }, (versionError) => console.error("MENU VERSION ERROR:", versionError));
  });

  return () => {
    mounted = false;
    unsubscribeFoodFlag();
    unsubscribeDrinksFlag();
    unsubscribeVersion();
    unsubscribeCreateAt();
  };
}, []);





  // ==========================
  // CATEGORY
  // ==========================


const categories = useMemo(()=>[
  "All",
  ...new Set(
    menu.filter((item) => item.menuType === menuType)
    .map(i=>i.category)
    .filter(Boolean)
  )
], [menu, menuType]);

const activeMenu = useMemo(() => menu.filter((item) => item.menuType === menuType), [menu, menuType]);

useLayoutEffect(() => {
  if (!resetMenuTypeScrollRef.current) return;
  resetMenuTypeScrollRef.current = false;

  const frame = window.requestAnimationFrame(() => {
    const categoriesBar = categoryRef.current;
    if (categoriesBar) {
      categoriesBar.scrollTo({ left: 0, behavior: "auto" });
      categoriesBar.parentElement?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  });

  return () => window.cancelAnimationFrame(frame);
}, [menuType, menuTypeScrollReset]);

const selectMenuType = (type) => {
  resetMenuTypeScrollRef.current = true;
  setMenuTypeScrollReset((value) => value + 1);
  setMenuType(type);
  setCategory("All");
};


  const filteredMenu =

    category==="All"

    ?

    activeMenu

    :

    activeMenu.filter(
      i=>i.category===category
    );






  // ==========================
  // SELECT ITEM
  // ==========================

const vibrate = (time = 50) => {
  if (navigator.vibrate) {
    navigator.vibrate(time);
  }
};
 
 
 
const resetSelection = () => {

  vibrate(120);

  setSelectedItems([]);

  setCart({});

  setShowCart(false);

  setCategory("All");

  setNote("");

  // vrati kategorije skroz lijevo
  if(categoryRef.current){
    categoryRef.current.scrollTo({
      left: 0,
      behavior: "smooth"
    });
  }

  // vrati artikle na početak
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

};
 
 
 
 
 
 
 
const closeCart = () => {
  if (cartHistoryOpenRef.current) {
    window.history.back();
  } else {
    setShowCart(false);
  }

};
 
const toggleSelect=(item)=>{
  if (selectedItems.includes(item.id)) {
    setCart((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setSelectedItems((current) => current.filter((id) => id !== item.id));
    return;
  }
  setSelectedItems((current) => current.includes(item.id)
    ? current
    : [...current, item.id]);
};





const selectedCount = selectedItems.length;





  // ==========================
  // OPEN CART
  // ==========================



const openCart = () => {
  setCart((current) => {
    const next = {};
    menu
      .filter((item) => selectedItems.includes(item.id))
      .forEach((item) => {
        next[item.id] = {
          ...current[item.id],
          ...item,
          qty: current[item.id]?.qty || 1,
        };
      });
    return next;
  });

  window.history.pushState({ ...(window.history.state || {}), orderCart: true }, "");
  cartHistoryOpenRef.current = true;
  setShowCart(true);
};




  // ==========================
  // CART ACTIONS
  // ==========================


  const addVoiceMatches = (matches, { showSuccess = true } = {}) => {
  if (!matches?.length) return;
  const added = matches.map(({ item, quantity }) => ({
    item,
    quantity: Math.max(1, Math.min(99, Number(quantity) || 1)),
  }));
  setSelectedItems((current) => [...new Set([...current, ...added.map(({ item }) => item.id)])]);
  setCart((current) => {
    const next = { ...current };
    for (const { item, quantity } of added) {
      const previousQuantity = current[item.id]?.qty ?? (selectedItems.includes(item.id) ? 1 : 0);
      next[item.id] = { ...current[item.id], ...item, qty: Math.min(99, previousQuantity + quantity) };
    }
    return next;
  });
  setVoiceSuggestions(null);
  setVoicePanelOpen(false);
  if (showSuccess) {
    setVoiceSuccess(added.map(({ item, quantity }) => ({ name: item.name, quantity })));
    window.clearTimeout(voiceSuccessTimerRef.current);
    voiceSuccessTimerRef.current = window.setTimeout(() => setVoiceSuccess([]), 2050);
  } else {
    window.clearTimeout(voiceSuccessTimerRef.current);
    setVoiceSuccess([]);
  }
};

const processVoiceTranscript = (transcript) => {
  const text = displayVoiceTranscript(transcript).trim();
  if (!text) return;
  setVoiceTranscript(text);
  voiceTranscriptRef.current = text;
  const resolved = resolveVoiceOrder(text, menu);
  if (resolved.matches.length) addVoiceMatches(resolved.matches, { showSuccess: !resolved.suggestions.length });
  if (resolved.suggestions.length) {
    const quantity = Math.max(1, Math.min(99, Number(resolved.suggestionQuantity) || inferVoiceQuantity(text)));
    const candidates = resolved.suggestions.map(({ item }) => ({ item, quantity }));
    setVoiceCandidateQuantities(Object.fromEntries(candidates.map(({ item }) => [item.id, quantity])));
    setVoiceSelectedCandidateId(null);
    setVoiceSuggestions({ transcript: resolved.unresolvedTerms?.join(" ") || text, items: candidates, recognized: resolved.matches || [] });
    setVoicePanelOpen(false);
    return;
  }
  if (resolved.matches.length) return;
  setVoicePanelOpen(true);
  setVoiceError("Nisam pronašao taj artikal. Izgovori makar jednu riječ iz naziva artikla.");
  setVoiceListening(false);
};

const playVoiceReadyBeep = () => {
  const context = voiceAudioContextRef.current;
  if (!context) return;
  const play = () => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.17);
  };
  if (context.state === "suspended") context.resume().then(play).catch(() => {});
  else play();
};

const startVoiceRecognition = () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  setVoiceSuggestions(null);
  setVoiceError("");
  setVoiceTranscript("");
  voiceTranscriptRef.current = "";
  voiceRecognitionErrorRef.current = "";
  voiceCanceledRef.current = false;
  setVoicePanelOpen(true);
  if (!Recognition) {
    setVoiceError("Ovaj pregledač ne podržava prepoznavanje govora. Otvori meni u Chrome-u ili Edge-u.");
    return;
  }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !voiceAudioContextRef.current) {
      voiceAudioContextRef.current = new AudioContextClass();
    }
    if (voiceAudioContextRef.current?.state === "suspended") {
      voiceAudioContextRef.current.resume().catch(() => {});
    }
    const recognition = new Recognition();
    speechRecognitionRef.current = recognition;
    recognition.lang = "sr-RS";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setVoiceListening(true);
      vibrate(55);
      playVoiceReadyBeep();
    };
    recognition.onresult = (event) => {
      const text = displayVoiceTranscript(Array.from(event.results)
        .map((result) => result?.[0]?.transcript || "").filter(Boolean).join(" ").trim());
      voiceTranscriptRef.current = text;
      setVoiceTranscript(text);
    };
    recognition.onerror = (event) => {
      voiceRecognitionErrorRef.current = event.error || "speech-error";
      setVoiceListening(false);
    };
    recognition.onend = () => {
      speechRecognitionRef.current = null;
      setVoiceListening(false);
      if (voiceCanceledRef.current) return;
      const text = voiceTranscriptRef.current.trim();
      if (text) { processVoiceTranscript(text); return; }
      window.clearTimeout(voiceRetryTimerRef.current);
      voiceRetryTimerRef.current = window.setTimeout(() => {
        const error = voiceRecognitionErrorRef.current;
        setVoiceError(error === "not-allowed" || error === "service-not-allowed"
          ? "Dozvoli pristup mikrofonu u podešavanjima pregledača."
          : error === "network"
            ? "Prepoznavanje govora nije dostupno. Provjeri internet vezu."
            : "Nisam čuo govor. Pokušaj ponovo i izgovori naziv artikla.");
      }, 1000);
    };
    recognition.start();
  } catch {
    setVoiceListening(false);
    setVoiceError("Mikrofon trenutno nije dostupan. Pokušaj ponovo.");
  }
};

const closeVoicePanel = () => {
  voiceCanceledRef.current = true;
  window.clearTimeout(voiceRetryTimerRef.current);
  speechRecognitionRef.current?.abort?.();
  speechRecognitionRef.current = null;
  setVoiceListening(false);
  setVoicePanelOpen(false);
};

const changeVoiceCandidateQuantity = (itemId, delta) => {
  setVoiceCandidateQuantities((current) => ({
    ...current,
    [itemId]: Math.max(1, Math.min(99, (Number(current[itemId]) || 1) + delta)),
  }));
};

const increase=(id)=>{


    setCart(prev=>({

      ...prev,

      [id]:{

        ...prev[id],

        qty:
        prev[id].qty+1

      }

    }));

  };






  const decrease=(id)=>{


    setCart(prev=>({

      ...prev,

      [id]:{

        ...prev[id],

        qty:
        Math.max(
          1,
          prev[id].qty-1
        )

      }

    }));


  };






 const removeItem=(id)=>{


setCart(prev=>{

const copy={...prev};

delete copy[id];

return copy;

});


setSelectedItems(prev =>
prev.filter(itemId=>itemId !== id)
);


};







  const totalPrice = useMemo(()=>{


    return Object.values(cart)

    .reduce(

      (sum,item)=>

      sum +

      Number(item.price)
      *
      item.qty,

      0

    );


  },[cart]);









  // ==========================
  // SEND ORDER
  // ==========================


 
const confirmOrder = async () => {

    if (sending || sendingGuardRef.current) return;


    // PROVJERA PRAZNE KORPE
 if (
    Object.keys(cart).length === 0 ||
    Object.values(cart).every(item => item.qty <= 0)
) {
    alert("KORPA JE PRAZNA");
    return;
}


    if (!user) {
        alert("Nisi logovan");
        return;
    }

    const items = Object.values(cart);
    const invalidItem = items.some((item) => {
        const quantity = Number(item.qty);
        const price = Number(item.price);
        return !Number.isInteger(quantity) || quantity < 1 ||
            !Number.isFinite(price) || price < 0;
    });

    if (invalidItem) {
        alert("Neispravna količina ili cijena artikla.");
        return;
    }

    const sum = Math.round(items.reduce(
        (total, item) => total + Number(item.price) * Number(item.qty),
        0
    ) * 100) / 100;

    if (!Number.isFinite(sum)) {
        alert("Neispravna ukupna cijena.");
        return;
    }

    const signatureItems = items.map((item) => ({
        name: String(item.name || ""),
        description: String(item.description || ""),
        qty: Number(item.qty),
        price: Number(item.price).toFixed(2),
        menuType: item.menuType === "drinks" ? "drinks" : "food",
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const signature = JSON.stringify({
        userId: user.uid,
        items: signatureItems,
        note: note.trim(),
    });
    const attemptStorageKey = `pending-order:${N.ROOT_RESTORAN}:${user.uid}`;
    let attempt = pendingOrderAttemptRef.current;
    if (!attempt) {
        try {
            attempt = JSON.parse(sessionStorage.getItem(attemptStorageKey) || "null");
        } catch {
            attempt = null;
        }
    }
    if (attempt && attempt.signature !== signature) {
        alert("Prethodna narudžba još nije potvrđena. Ponovite slanje iste korpe da biste izbjegli duplu narudžbu.");
        return;
    }
    if (!attempt) attempt = { id: makeOrderId(), signature };
    pendingOrderAttemptRef.current = attempt;
    try {
        sessionStorage.setItem(attemptStorageKey, JSON.stringify(attempt));
    } catch { }

    const orderId = attempt.id;
    const ref = child(ordersRestoran(), orderId);
    sendingGuardRef.current = true;
    setSending(true);
    setSeconds(20);

    let finished = false;

    const timer = setInterval(() => {

        setSeconds(prev => {

            if (prev <= 1) {

                clearInterval(timer);

                return 0;
            }

            return prev - 1;

        });

    }, 1000);

    const timeout = setTimeout(() => {

        if (finished) return;
        clearInterval(timer);
        setSeconds(0);
        // Firebase may still be committing this same order. Keep the form
        // locked until its write resolves so a slow acknowledgement cannot
        // create a duplicate or delete an order that already reached the server.

    }, 20000);

    const finishAcceptedOrder = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        clearInterval(timer);
        sendingGuardRef.current = false;
        pendingOrderAttemptRef.current = null;
        try { sessionStorage.removeItem(attemptStorageKey); } catch { }
        setSending(false);
        setSeconds(0);
        setCart({});
        setSelectedItems([]);
        setNote("");
        setShowCart(false);
        if (cartHistoryOpenRef.current) window.history.back();
        setOrdered(true);
        setTimeout(() => setOrdered(false), 2000);
    };

    try {

        const text =
            items
                .map(i => `${i.qty > 1 ? i.qty + "X " : ""}${i.name}`)
                .join("\n");

        const desc =
            items
                .map(i => i.description || "")
                .join("\n");

        const now = new Date();
        const pad = (value) => String(value).padStart(2, "0");
        const time =
            `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ` +
            `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;

        const orderData = {
            orderId,

            orderById: user.uid,

            orderPersonName: user.ime,

            time,

            status: "pending",

            totalPrice: sum.toFixed(2),

            priprema: "0",

            name: text,

            description: desc,

            itemTypes: items.map((item) => item.menuType === "drinks" ? "drinks" : "food"),

            stockItems: items
                .filter((item) => item.menuType === "drinks" && item.sourceId != null)
                .map((item) => ({ menuItemId: String(item.sourceId), quantity: Number(item.qty) })),

            addittionalInfo: note.trim()
        };

        console.info("[ORDER_CREATE] start", { orderId, itemCount: items.length });
        let transaction;
        let attempt = 0;
        while (true) {
            try {
                if (!navigator.onLine) await waitForBrowserOnline();

                const completedSnapshot = await get(completeOrderRef(user.uid, orderId));
                if (completedSnapshot.exists()) {
                    console.info("[ORDER_CREATE] already completed; skipping", { orderId });
                    finishAcceptedOrder();
                    return;
                }

                transaction = await runTransaction(ref, (current) => {
                    if (current !== null) return undefined;
                    return orderData;
                }, { applyLocally: false });

                if (!transaction.committed && !sameOrderPayload(transaction.snapshot.val(), orderData)) {
                    throw new Error("ID narudžbe već postoji sa drugim podacima.");
                }
                break;
            } catch (networkError) {
                if (!isTemporaryNetworkError(networkError) || attempt >= 5) throw networkError;
                const retryDelay = Math.min(1000 * (2 ** attempt), 10000);
                attempt += 1;
                console.warn("[ORDER_CREATE] transient network issue; retrying same ID", {
                    orderId, attempt, retryDelay, online: navigator.onLine,
                });
                if (!navigator.onLine) await waitForBrowserOnline();
                else await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
            }
        }

        console.info("[ORDER_CREATE] accepted", {
            orderId,
            created: transaction.committed,
            existingSameOrder: !transaction.committed,
        });
        finishAcceptedOrder();

    } catch (e) {

        if (!finished) {

            finished = true;

            clearTimeout(timeout);
            clearInterval(timer);

            // Zadržavamo ID i ne uklanjamo zapis na grešci: server je možda već
            // prihvatio upis. Ponovni pokušaj koristi isti ID i transakciju.
            sendingGuardRef.current = false;
            setSending(false);
            setSeconds(0);

            console.error("[ORDER_CREATE] failed", {
                orderId,
                message: e?.message || String(e),
                code: e?.code || "",
            }, e);

            alert(
                "Potvrda narudžbe nije stigla. Pokušajte ponovo sa istom korpom; koristiće se isti ID."
            );

        }

    }

};






  if(loading){

    return (

      <div className="
      min-h-screen
      bg-black
      text-white
      p-5
      ">

        Učitavanje...

      </div>

    );

  }







  return (

    <>

<div
className="
min-h-screen
bg-black
text-white
p-4
pb-40
"
>


{/* IZBOR MENIJA I KATEGORIJE */}

{menu.length > 0 && <div className="sticky top-0 z-50 mb-6 bg-black/95 py-3 backdrop-blur-xl">
  {menu.some((item) => item.menuType === "food") && menu.some((item) => item.menuType === "drinks") && <div className="mb-2 flex gap-2 px-1">
    {[{ type: "food", label: "HRANA" }, { type: "drinks", label: "PIĆE" }].map((option) => <button
      key={option.type}
      type="button"
      onClick={() => selectMenuType(option.type)}
      className={`flex-1 rounded-xl border px-4 py-2 text-sm font-bold tracking-wide ${menuType === option.type ? "border-orange-500 bg-orange-500 text-black" : "border-neutral-700 bg-neutral-900 text-white"}`}
      aria-pressed={menuType === option.type}
    >{option.label}</button>)}
  </div>}

  <div className="flex justify-end px-1 pb-2">
    <button
      type="button"
      onClick={startVoiceRecognition}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${voiceListening ? "border-red-400 bg-red-500 text-white shadow-lg shadow-red-950/40" : "border-orange-500/50 bg-neutral-900 text-orange-300 hover:bg-orange-500/10"}`}
      aria-label="Glasovna narudžba"
    >
      <Mic size={18} aria-hidden="true" />
      Glasovna narudžba
    </button>
  </div>

<div
ref={categoryRef}
className="flex gap-3 overflow-x-auto"
>

      {
        categories.map(c=>(
		
		
	 

          <button

          key={c}

          onClick={()=>{ setCategory(c); window.scrollTo({ top: 0, behavior: "smooth" }); }}

          className={`

          px-5
          py-2
          rounded-full
          whitespace-nowrap

          ${
            category===c

            ?

            "bg-orange-500 text-black"

            :

            "bg-neutral-900"

          }

          `}

          >

          {c}

          </button>

        ))

      }


      </div>
      </div>}
	  
	  
	 






 


 {/* ARTIKLI */}

<div
  className="
    grid
    grid-cols-2
    gap-4
    xl:grid-cols-3
  "
>

{
filteredMenu.map(item=>{

const selected = selectedItems.includes(item.id);

return (

 <div
key={item.id}
onClick={()=>toggleSelect(item)}
className={`
relative
cursor-pointer
rounded-[28px]
h-[300px]
p-5
transition
duration-300
border
overflow-hidden
flex
flex-col

${
selected

?

"bg-white text-black border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.35)] scale-[1.01]"

:

"bg-[#18181b] text-white border-neutral-800 hover:border-orange-500"

}

`}
>



{
selected &&

<div
className="
absolute
top-5
right-5
w-12
h-12
rounded-full
bg-orange-500
flex
items-center
justify-center
font-black
text-xl
shadow-lg
"
>

✓

</div>

}




<h2
className="
text-xl
font-black
tracking-tight
leading-tight
break-words
"
>

{item.name}

</h2>



<p
className="
mt-3
text-xs
leading-relaxed
opacity-70
line-clamp-5
"
>
{item.description}
</p>




<div
className="
mt-auto
pt-4
flex
justify-between
items-center
"
>


<span
className="
text-xs
uppercase
opacity-60
font-bold
"
>

Cijena

</span>



<span
className="
text-xl
font-black
text-orange-500
"
>

{item.price} €

</span>


</div>



</div>


)

})

}


</div>


      </div> 
      {/* kraj glavnog page containera */}



      {/* FIXED BAR */}

      {
        selectedCount > 0 &&

        <div
          className="
          fixed
          bottom-0
          left-0
          right-0
          z-[100]
          bg-neutral-950/95
          backdrop-blur-xl
          border-t
          border-neutral-800
          p-4
          "
        >

          <div
className="
max-w-6xl
mx-auto
flex
items-center
gap-3
"
>


{/* ODABRANO */}

<div
className="
flex
items-center
gap-2
bg-green-500/10
border
border-green-500/30
px-3
py-2
rounded-3xl
flex-1
"
>




<div
className="
flex
items-center
gap-2
leading-tight
"
>

<div
className="
text-green-400
text-[11px]
uppercase
font-black
tracking-wider
"
>
Odabrano
</div>

<div
className="
w-12
h-12
rounded-2xl
bg-green-500
text-black
flex
items-center
justify-center
font-black
text-2xl
shadow-[0_0_25px_rgba(34,197,94,0.45)]
"
>
{selectedCount}
</div>

</div>





</div>



{/* RESET */}

<button

onClick={resetSelection}

className="
w-14
h-14
rounded-3xl
bg-neutral-900
border
border-neutral-700
text-neutral-300
text-2xl
font-black
flex
items-center
justify-center
shadow-lg
active:scale-90
transition
hover:border-red-500
hover:text-red-400
"

>
↻

</button>



{/* NARUČI */}

<button
onClick={() => {
vibrate(60);
openCart();
}}

className="
flex-1
h-16
bg-orange-500
text-black
rounded-3xl
font-black
text-lg
shadow-[0_0_35px_rgba(249,115,22,0.35)]
active:scale-95
transition
flex
items-center
justify-center
gap-2
"

>

<span>
🛒
</span>

NARUČI

</button>


</div>
		  
	  
		  
		  


          </div>

       

      }


{
ordered &&

<div
className="
fixed
inset-0
z-[999]
pointer-events-auto
bg-black/90
backdrop-blur-xl
flex
items-center
justify-center
animate-fadeIn
"
>

<div
className="
text-center
animate-scaleIn
"
>

<div
className="
w-28
h-28
mx-auto
rounded-full
bg-orange-500
flex
items-center
justify-center
shadow-[0_0_50px_rgba(249,115,22,0.6)]
animate-checkCircle
"
>

<svg
width="70"
height="70"
viewBox="0 0 52 52"
fill="none"
>

<path
d="M14 27 L22 35 L39 16"
stroke="black"
strokeWidth="6"
strokeLinecap="round"
strokeLinejoin="round"
className="animate-drawCheck"
/>

</svg>

</div>


<h1
className="
mt-8
text-4xl
font-black
animate-textUp
"
>
 
</h1>

 


  <h1
        style={{
          marginTop: 30,
          color: "white",
          fontSize: 42,
          fontWeight: 900,
        }}
      >
        Naručeno
      </h1>


</div>

</div>

}



      {voicePanelOpen && (
        <div
          className="fixed inset-0 z-[1200] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={closeVoicePanel}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-order-title"
            className="w-full max-w-md overflow-hidden rounded-3xl border border-neutral-700 bg-[#111315] text-white shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="mb-1 flex items-center gap-2 text-orange-300">
                  <Mic size={18} />
                  <span className="text-xs font-bold uppercase tracking-[0.18em]">Glasovna narudžba</span>
                </div>
                <h2 id="voice-order-title" className="text-xl font-black">{voiceListening ? "Slušam…" : voiceError ? "Pokušaj ponovo" : "Izgovori naziv artikla"}</h2>
              </div>
              <button type="button" onClick={closeVoicePanel} className="rounded-xl p-2 text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="Zatvori">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="min-h-12 text-base leading-relaxed text-neutral-200">
                  {voiceTranscript || voiceError || (voiceListening ? "Izgovori naziv artikla i količinu…" : "Pripremam mikrofon…")}
                </p>
                {voiceListening && (
                  <div className="mt-4 flex h-9 items-center justify-center gap-1.5" aria-label="Slušam govor">
                    {[10, 18, 26, 15, 30, 20, 12, 24, 15, 28, 11].map((height, index) => (
                      <span key={index} className="w-1.5 rounded-full bg-orange-400 animate-pulse" style={{ height, animationDuration: `${0.42 + (index % 4) * 0.16}s`, animationDelay: `${index * 45}ms` }} />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-center text-sm text-neutral-400">Izgovori naziv artikla i količinu. Narudžba se dodaje tek nakon prepoznavanja.</p>
              <div className="flex gap-3">
                <button type="button" onClick={closeVoicePanel} className="flex-1 rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 font-bold text-neutral-200 hover:bg-neutral-800">Otkaži</button>
                {voiceListening ? (
                  <button type="button" onClick={() => speechRecognitionRef.current?.stop?.()} className="flex-1 rounded-2xl bg-orange-500 px-4 py-3 font-black text-black hover:bg-orange-400">Završi</button>
                ) : (
                  <button type="button" onClick={startVoiceRecognition} className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 font-black text-white hover:bg-red-500">
                    <RotateCcw size={17} /> Pokušaj ponovo
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {voiceSuggestions && (
        <div
          className="fixed inset-0 z-[1210] grid place-items-center bg-black/75 p-3 backdrop-blur-sm"
          onClick={() => setVoiceSuggestions(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-suggestions-title"
            className="flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-[#f8faf9] text-[#17231f] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="shrink-0 border-b border-neutral-200 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-emerald-700"><Mic size={17} /> Glasovna pretraga</div>
              <h2 id="voice-suggestions-title" className="mt-1 text-xl font-black sm:text-2xl">Izaberi pronađeni artikal</h2>
              <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm leading-relaxed text-neutral-700">
                Izgovoreno: „{voiceSuggestions.transcript}“ · Izaberi mogući artikal i potvrdi izbor.
              </p>
              {!!voiceSuggestions.recognized?.length && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-800">Sigurno prepoznato i dodato</p>
                {voiceSuggestions.recognized.map(({ item, quantity }) => <p key={item.id} className="mt-1 flex items-center gap-2 text-sm font-bold text-emerald-900"><Check size={16} /> {item.name} × {quantity}</p>)}
              </div>}
            </header>
            <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
              <p className="px-1 text-xs font-black uppercase tracking-wide text-neutral-500">Mogući artikli</p>
              {voiceSuggestions.items.map(({ item }) => {
                const quantity = voiceCandidateQuantities[item.id] || 1;
                const isSelected = voiceSelectedCandidateId === item.id;
                const price = Number(String(item.price ?? "0").replace(",", ".")) || 0;
                return (
                  <article
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setVoiceSelectedCandidateId(item.id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setVoiceSelectedCandidateId(item.id); } }}
                    className={`cursor-pointer rounded-2xl border p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md ${isSelected ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-200" : "border-neutral-200 bg-white"}` }
                  >
                    <div className="flex items-start justify-between gap-3"><h3 className="text-lg font-black leading-tight">{item.name}</h3>{isSelected && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Check size={17} strokeWidth={3} /></span>}</div>
                    {item.description && <p className="mt-1 text-sm leading-relaxed text-neutral-500">{item.description}</p>}
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => changeVoiceCandidateQuantity(item.id, -1)} className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-lg font-black text-emerald-800 hover:bg-emerald-100" aria-label="Smanji količinu"><Minus size={17} /></button>
                        <span className="min-w-7 text-center text-base font-black">{quantity}</span>
                        <button type="button" onClick={() => changeVoiceCandidateQuantity(item.id, 1)} className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-lg font-black text-emerald-800 hover:bg-emerald-100" aria-label="Povećaj količinu"><Plus size={17} /></button>
                      </div>
                      <span className="text-lg font-black text-emerald-700">{(price * quantity).toFixed(2)} €</span>
                    </div>
                  </article>
                );
              })}
            </div>
            <footer className="shrink-0 border-t border-neutral-200 bg-white px-4 py-3 sm:px-6">
              <div className="space-y-2">
                <button type="button" disabled={!voiceSelectedCandidateId} onClick={() => { const selected = voiceSuggestions.items.find(({ item }) => item.id === voiceSelectedCandidateId); if (selected) addVoiceMatches([{ item: selected.item, quantity: voiceCandidateQuantities[selected.item.id] || 1 }]); }} className="w-full rounded-2xl bg-emerald-700 px-4 py-3 font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500">Potvrdi</button>
                <button type="button" onClick={() => { setVoiceSuggestions(null); setVoiceSelectedCandidateId(null); }} className="w-full rounded-2xl border border-neutral-300 bg-neutral-100 px-4 py-3 font-bold text-neutral-700 hover:bg-neutral-200">Otkaži</button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {voiceSuccess.length > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[1300] grid place-items-center bg-black/35 p-4" aria-live="polite">
          <div className="animate-checkCircle w-full max-w-sm rounded-3xl border border-emerald-100 bg-white px-6 py-6 text-center text-[#17231f] shadow-2xl">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"><Check size={36} strokeWidth={3} /></div>
            <div className="mt-4 space-y-1">
              {voiceSuccess.map((entry, index) => <p key={`${entry.name}-${index}`} className="text-lg font-black">{entry.name} × {entry.quantity}</p>)}
            </div>
            <p className="mt-2 font-bold text-emerald-700">Dodato u korpu</p>
          </div>
        </div>
      )}

      {/* CART MODAL */}

      {
        showCart &&

        <CartModal

          cart={cart}

          increase={increase}

          decrease={decrease}

          removeItem={removeItem}

          totalPrice={totalPrice}

          note={note}

          setNote={setNote}

         

          onConfirm={confirmOrder}
		  
	      sending={sending}

          seconds={seconds}
		  
		  onClose={closeCart}


        />

      }


    </>

  );

}
