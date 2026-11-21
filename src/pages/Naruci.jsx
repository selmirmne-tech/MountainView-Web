import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { child, get, onValue, push, set, remove} from "firebase/database";
import { menuRestoran, ordersRestoran } from "../firebase/refs";
import * as N from "../firebase/nodes";
import CartModal from "../components/CartModal";

const MENU_CACHE_KEY = "restoran_menu";
const MENU_DATE_KEY = "restoran_menu_date";
const MENU_DISPLAY_CACHE_KEY = "restoran_menu_display";
const menuVersion = (value) => {
  const match = String(value || "").match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
  return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime() : 0;
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
  const [loading, setLoading] = useState(true);

  // samo selekcija artikala
  const [selectedItems, setSelectedItems] = useState([]);

  const [category, setCategory] = useState("All");

  const [showCart, setShowCart] = useState(false);

  // prava korpa se kreira tek kad se otvori modal
  const [cart, setCart] = useState({});

  const [note, setNote] = useState("");
  
  const [sending, setSending] = useState(false);
const [seconds, setSeconds] = useState(0);

const [ordered, setOrdered] = useState(false);

  const user = JSON.parse(localStorage.getItem("user"));


const categoryRef = useRef(null);
const cartHistoryOpenRef = useRef(false);
const allMenuRef = useRef([]);
const displayFlagsRef = useRef({ food: true, drinks: true });

 

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
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const explicitlyAllOff = (foodFlag === false && drinksFlag === false)
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
          food: foodFlag ?? (offline ? displayFlagsRef.current.food : allMenuRef.current.some((item) => item.menuType === "food")),
          drinks: drinksFlag ?? (offline ? displayFlagsRef.current.drinks : allMenuRef.current.some((item) => item.menuType === "drinks")),
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
          food: foodFlag ?? Object.keys(foodItems).length > 0,
          drinks: drinksFlag ?? Object.keys(drinksItems).length > 0,
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

const selectMenuType = (type) => {
  setMenuType(type);
  setCategory("All");
  if (categoryRef.current) categoryRef.current.scrollLeft = 0;
  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
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

    if (sending) return;


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
    setSending(true);
    setSeconds(20);

    let finished = false;

    const ref = push(ordersRestoran());

    const timer = setInterval(() => {

        setSeconds(prev => {

            if (prev <= 1) {

                clearInterval(timer);

                return 0;
            }

            return prev - 1;

        });

    }, 1000);

    const timeout = setTimeout(async () => {

        if (finished) return;

        finished = true;

        clearInterval(timer);

        try {

            await remove(ref);

        } catch (e) {

            console.log(e);

        }

        setSending(false);
        setSeconds(0);

        alert(
            "Narudžba nije poslana.\nMolimo pokušajte ponovo."
        );

    }, 20000);

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

        await set(ref, {

            orderId: ref.key,

            orderById: user.uid,

            orderPersonName: user.ime,

            time,

            status: "pending",

            totalPrice: sum.toFixed(2),

            priprema: "0",

            name: text,

            description: desc,

            addittionalInfo: note.trim()

        });

        if (finished) return;

        finished = true;

        clearTimeout(timeout);
        clearInterval(timer);

setSending(false);
setSeconds(0);

setCart({});
setSelectedItems([]);
setNote("");
setShowCart(false);
if (cartHistoryOpenRef.current) {
  window.history.back();
}

setOrdered(true);

setTimeout(() => {

    setOrdered(false);

}, 2000);

    } catch (e) {

        if (!finished) {

            finished = true;

            clearTimeout(timeout);
            clearInterval(timer);

            try {

                await remove(ref);

            } catch { }

            setSending(false);
            setSeconds(0);

            alert(
                "Narudžba nije poslana.\nMolimo pokušajte ponovo."
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
