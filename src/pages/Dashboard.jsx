import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { child, get, onValue, update } from "firebase/database";
import { rootRestoran, smjenaRef, usersRestoran } from "../firebase/refs";
import { auth, getMessagingSafe } from "../firebase/config";
import { getToken } from "firebase/messaging";
import { Bell, Clock, Info, LogOut, Menu, QrCode, X } from "lucide-react";
import {
  getSmjenaConfig,
  syncSmjenaFromSnapshot,
  saveSmjenaToFirebase,
  getActiveShiftName,
  formatLastChanged,
  NACIN_AUTOMATSKI,
  NACIN_PRVA,
  NACIN_DRUGA,
} from "../utils/smjenaManager";

const readLocalUser = () => {
  try {
    const data = localStorage.getItem("user");
    if (!data || data === "undefined" || data === "null") return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
};

export default function Dashboard() {
  const [user, setUser] = useState(readLocalUser);
  const [toast, setToast] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [smjenaConfig, setSmjenaConfig] = useState(getSmjenaConfig());
  const [smjenaModalOpen, setSmjenaModalOpen] = useState(false);
  const [smjenaFormNacin, setSmjenaFormNacin] = useState(smjenaConfig.nacin);
  const [smjenaFormOd, setSmjenaFormOd] = useState(smjenaConfig.prvaOd);
  const [smjenaFormDo, setSmjenaFormDo] = useState(smjenaConfig.prvaDo);
  const [smjenaSaving, setSmjenaSaving] = useState(false);
  const accountMenuRef = useRef(null);
  const navigate = useNavigate();
  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };

  const enableNotifications = async () => {
    setAccountMenuOpen(false);

    const uid = auth.currentUser?.uid || user?.uid;
    if (!uid) {
      showToast("Nije moguće pronaći prijavljenog korisnika.");
      return;
    }

    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !window.isSecureContext ||
      !("serviceWorker" in navigator)
    ) {
      showToast("Ovaj browser ne podržava web obavještenja. Otvorite aplikaciju u Chromeu ili Safariju.");
      return;
    }

    setNotificationBusy(true);
    try {
      // Dozvola se traži direktno nakon korisnikovog klika na stavku menija.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showToast(
          permission === "denied"
            ? "Obavještenja su blokirana u postavkama browsera."
            : "Dozvola za obavještenja nije odobrena."
        );
        return;
      }

      let registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) {
        registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        );
      }

      const messaging = await getMessagingSafe();
      if (!messaging) {
        showToast("FCM obavještenja nisu podržana u ovom browseru.");
        return;
      }

      const token = await getToken(messaging, {
        vapidKey:
          "BHe7nSvVdLbYzSKV1boLUgrj35JH5UrvIdP7HRsMn4E1B4nl19IXlDjiLg-OZHnN1_DmFAgfAX2atjsfdEGD-co",
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        showToast("Browser nije vratio FCM token. Pokušajte u Chromeu ili Safariju.");
        return;
      }

      await update(child(usersRestoran(), uid), { fcmToken: token });
      const updatedUser = { ...user, uid, fcmToken: token };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      showToast("Obavještenja su uključena.");
    } catch (error) {
      console.error("Enable notifications error:", error);
      showToast("Nije bilo moguće uključiti obavještenja u ovom browseru.");
    } finally {
      setNotificationBusy(false);
    }
  };
  const openStats = () => user?.titula === "Administrator" ? navigate("/stats") : showToast("Nemate pravo pristupa!");
  const openAdmin = () => user?.titula === "Administrator" ? navigate("/admin") : showToast("Nemate pravo pristupa!");
  const openAccounting = () => ["Administrator", "Konobar"].includes(user?.titula) ? navigate("/obracun") : showToast("Nemate pravo pristupa!");

  useEffect(() => {
    return onValue(smjenaRef(), (snapshot) => {
      syncSmjenaFromSnapshot(snapshot);
      setSmjenaConfig(getSmjenaConfig());
    });
  }, []);

  const handleOpenSmjenaModal = () => {
    const cfg = getSmjenaConfig();
    setSmjenaConfig(cfg);
    setSmjenaFormNacin(cfg.nacin);
    setSmjenaFormOd(cfg.prvaOd);
    setSmjenaFormDo(cfg.prvaDo);
    setAccountMenuOpen(false);
    setSmjenaModalOpen(true);
  };

  const handleSaveSmjena = async () => {
    setSmjenaSaving(true);
    try {
      const updatedBy = user?.ime || user?.email || "Web";
      const res = await saveSmjenaToFirebase(
        smjenaFormNacin,
        smjenaFormOd,
        smjenaFormDo,
        updatedBy
      );
      setSmjenaConfig(res);
      showToast("Smjena uspješno sačuvana!");
      setSmjenaModalOpen(false);
    } catch (err) {
      console.error("Greška pri čuvanju smjene:", err);
      showToast("Greška pri čuvanju smjene!");
    } finally {
      setSmjenaSaving(false);
    }
  };
const [licenseExpired, setLicenseExpired] = useState(false);

// LOAD USER ON START
useEffect(() => {
  const loadUser = async () => {
    try {
      const data = localStorage.getItem("user");

      if (!data || data === "undefined" || data === "null") {
        setUser(null);
        return;
      }

      const localUser = JSON.parse(data);
      setUser(localUser);
      const uid = auth.currentUser?.uid || localUser.uid;

      if (!uid) {
        return;
      }

      const snapshot = await get(child(usersRestoran(), uid));

      if (snapshot.exists()) {
        const fullUser = {
          ...snapshot.val(),
          uid,
        };

        localStorage.setItem("user", JSON.stringify(fullUser));
        setUser(fullUser);
      } else {
        setUser(localUser);
      }

    } catch (error) {
      console.error("DASHBOARD USER ERROR:", error);
    }
  };

  loadUser();
}, []);

useEffect(() => {
  if (!accountMenuOpen) return undefined;
  const closeOnOutsideClick = (event) => {
    if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false);
  };
  const closeOnEscape = (event) => {
    if (event.key === "Escape") setAccountMenuOpen(false);
  };
  document.addEventListener("pointerdown", closeOnOutsideClick);
  document.addEventListener("keydown", closeOnEscape);
  return () => {
    document.removeEventListener("pointerdown", closeOnOutsideClick);
    document.removeEventListener("keydown", closeOnEscape);
  };
}, [accountMenuOpen]);




useEffect(() => {

  const expireRef = child(
    rootRestoran(),
    "Expire"
  );


  const unsubscribe = onValue(
    expireRef,
    (snap) => {

      if (!snap.exists()) {
        return;
      }


      let expire = snap.val();


      // ako nije string pretvori
      expire = String(expire);


      const parts = expire.split(".");


      if(parts.length !== 3){
        return;
      }


      const expireDate = new Date(
        parts[2],
        parts[1] - 1,
        parts[0]
      );


      const today = new Date();

      today.setHours(0,0,0,0);
      expireDate.setHours(0,0,0,0);



      if(expireDate < today){

        setLicenseExpired(true);

      }


    }
  );


  return () => unsubscribe();


}, []);







  const Card = ({ icon, title, onClick }) => (
    <button className="dashboard-card" type="button" onClick={onClick} style={{
      width: "100%", minWidth: 0, minHeight: 0, height: "100%", boxSizing: "border-box", border: "1px solid #e5ebe8", borderRadius: 16,
      padding: 8, background: "#fff", boxShadow: "0 4px 16px rgba(23,61,49,.06)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 9, color: "#173d31", cursor: "pointer", font: "inherit", transition: "transform .18s ease, box-shadow .18s ease",
    }}>
      <div className="dashboard-card-icon" style={{ fontSize: 27, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: 14, lineHeight: 1.2, fontWeight: 700, textAlign: "center" }}>{title}</div>
    </button>
  );

  return (
  
  
  <>
{
licenseExpired &&

<div
style={{
position:"fixed",
inset:0,
zIndex:9999,
background:"rgba(0,0,0,0.65)",
display:"flex",
alignItems:"center",
justifyContent:"center",
padding:20
}}
>

<div
style={{
width:"100%",
maxWidth:380,
background:"linear-gradient(135deg,#22c55e,#2563eb)",
borderRadius:24,
padding:3,
boxShadow:"0 20px 50px rgba(0,0,0,0.35)"
}}
>

<div
style={{
background:"white",
borderRadius:22,
padding:30,
textAlign:"center"
}}
>

<div
style={{
fontSize:55,
marginBottom:15
}}
>
⚠️
</div>

<div
style={{
fontSize:24,
fontWeight:900,
color:"#111",
marginBottom:15
}}
>
Licenca je istekla
</div>

<div
style={{
fontSize:16,
color:"#555",
lineHeight:1.5
}}
>
Kontaktirajte administratora
</div>

</div>

</div>

</div>

}
  
  
  
  
  
  
  
  
  
  
  
  
    <div style={{ height: "100dvh", minHeight: 0, maxHeight: "100dvh", overflow: "hidden", boxSizing: "border-box", background: "#f3f6f5", padding: 8, display: "flex", flexDirection: "column" }}>
      <header style={{ width: "100%", boxSizing: "border-box", margin: "0 0 8px", padding: "10px 14px", borderRadius: 14, background: "linear-gradient(115deg, #0b6b5b, #008577)", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, boxShadow: "0 10px 28px rgba(0,91,77,.18)" }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ minWidth: 0, display: "grid", gap: 3 }}>
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15 }}>{user?.ime || "Korisnik"}</strong>
            <span style={{ color: "rgba(255,255,255,.78)", fontSize: 12 }}>{user?.titula === "Sank" ? "Šank" : user?.titula || "Nalog"}</span>
          </div>
        </div>
        <div ref={accountMenuRef} style={{ position: "relative", flex: "0 0 auto" }}>
          <button type="button" aria-label={accountMenuOpen ? "Zatvori meni naloga" : "Otvori meni naloga"} aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)} style={{ width: 44, height: 44, border: "1px solid rgba(255,255,255,.3)", borderRadius: 13, display: "grid", placeItems: "center", color: "white", background: "rgba(255,255,255,.14)", cursor: "pointer" }}>
            {accountMenuOpen ? <X size={22} /> : <Menu size={23} />}
          </button>
          {accountMenuOpen && <div role="menu" style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 20, width: 220, padding: 7, border: "1px solid #e2eae6", borderRadius: 15, background: "white", boxShadow: "0 16px 40px rgba(18,38,31,.18)" }}>
            <button type="button" role="menuitem" onClick={handleOpenSmjenaModal} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 11, border: 0, borderRadius: 10, padding: "11px 12px", background: "white", color: "#233b33", textAlign: "left", font: "inherit", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}><Clock size={18} /> Smjena</div>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#e8f5e9", color: "#2e7d32", fontWeight: 800 }}>{getActiveShiftName(new Date(), smjenaConfig)}</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); navigate("/about"); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, border: 0, borderRadius: 10, padding: "11px 12px", background: "white", color: "#233b33", textAlign: "left", font: "inherit", cursor: "pointer" }}><Info size={18} /> Informacije</button>
            <button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); navigate("/qr-menu"); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, border: 0, borderRadius: 10, padding: "11px 12px", background: "white", color: "#233b33", textAlign: "left", font: "inherit", cursor: "pointer" }}><QrCode size={18} /> QR meni</button>
            <button type="button" role="menuitem" onClick={() => void enableNotifications()} disabled={notificationBusy} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, border: 0, borderRadius: 10, padding: "11px 12px", background: "white", color: "#233b33", textAlign: "left", font: "inherit", cursor: notificationBusy ? "wait" : "pointer", opacity: notificationBusy ? 0.65 : 1 }}><Bell size={18} /> {notificationBusy ? "Uključujem obavještenja…" : user?.fcmToken ? "Osvježi obavještenja" : "Uključi obavještenja"}</button>
            <button type="button" role="menuitem" onClick={async () => {
              if (!window.confirm("Da li ste sigurni da želite da se odjavite?")) return;
              setAccountMenuOpen(false);
              const data = localStorage.getItem("user");
              if (data) {
                try {
                  const currentUser = JSON.parse(data);
                  await update(child(usersRestoran(), currentUser.uid), { fcmToken: "" });
                } catch (error) {
                  console.log("Logout FCM delete error:", error);
                }
              }
              localStorage.removeItem("user");
              localStorage.removeItem("fcmToken");
              window.dispatchEvent(new Event("user-logout"));
              navigate("/", { replace: true });
            }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, border: 0, borderRadius: 10, padding: "11px 12px", background: "white", color: "#a32d31", textAlign: "left", font: "inherit", cursor: "pointer" }}><LogOut size={18} /> Odjava</button>
          </div>}
        </div>
      </header>

      <div className="dashboard-cards" style={{ width: "100%", flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <Card icon="📄✏️" title="Naruči hranu" onClick={() => navigate("/order")} />
        <Card icon="👨‍🍳" title="Kuhinja" onClick={() => navigate("/kitchen")} />
        <Card icon="📊" title="Statistika" onClick={openStats} />
        <Card icon="📄" title="Računi" onClick={() => navigate("/Racuni")} />
        <Card icon="🍽️" title="Upravljanje menijem" onClick={openAdmin} />
        <Card icon="🧾" title="Obračun artikala" onClick={openAccounting} />
      </div>
    </div>
    {smjenaModalOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="smjena-modal-title" style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 420, padding: 22, boxShadow: "0 20px 45px rgba(0,0,0,0.25)", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 id="smjena-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#173d31", display: "flex", alignItems: "center", gap: 8 }}>
                <Clock size={20} color="#008577" /> Upravljanje smjenom
              </h2>
              <button type="button" aria-label="Zatvori" onClick={() => setSmjenaModalOpen(false)} style={{ background: "transparent", border: 0, padding: 4, cursor: "pointer", color: "#666", borderRadius: 8, display: "grid", placeItems: "center" }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ background: "#e8f5e9", border: "1px solid #c8e6c9", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#2e7d32", fontWeight: 600 }}>Trenutno aktivna:</span>
              <span style={{ fontSize: 13, fontWeight: 800, background: "#2e7d32", color: "white", padding: "3px 10px", borderRadius: 999 }}>
                {getActiveShiftName(new Date(), { nacin: smjenaFormNacin, prvaOd: smjenaFormOd, prvaDo: smjenaFormDo })}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 10, borderRadius: 10, border: "1.5px solid " + (smjenaFormNacin === NACIN_AUTOMATSKI ? "#008577" : "#e2eae6"), background: smjenaFormNacin === NACIN_AUTOMATSKI ? "#f0fdf4" : "white", cursor: "pointer" }}>
                <input type="radio" name="smjena_nacin" checked={smjenaFormNacin === NACIN_AUTOMATSKI} onChange={() => setSmjenaFormNacin(NACIN_AUTOMATSKI)} style={{ marginTop: 3, accentColor: "#008577" }} />
                <div>
                  <strong style={{ fontSize: 14, color: "#173d31", display: "block" }}>Automatski (po vremenu)</strong>
                  <span style={{ fontSize: 12, color: "#555" }}>Prva smjena od {smjenaFormOd} do {smjenaFormDo}, druga smjena preostalo vrijeme.</span>
                </div>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 10, borderRadius: 10, border: "1.5px solid " + (smjenaFormNacin === NACIN_PRVA ? "#008577" : "#e2eae6"), background: smjenaFormNacin === NACIN_PRVA ? "#f0fdf4" : "white", cursor: "pointer" }}>
                <input type="radio" name="smjena_nacin" checked={smjenaFormNacin === NACIN_PRVA} onChange={() => setSmjenaFormNacin(NACIN_PRVA)} style={{ marginTop: 3, accentColor: "#008577" }} />
                <div>
                  <strong style={{ fontSize: 14, color: "#173d31", display: "block" }}>Prva smjena (ručno)</strong>
                  <span style={{ fontSize: 12, color: "#555" }}>Uvijek računa kao I smjenu bez obzira na trenutno vrijeme.</span>
                </div>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 10, borderRadius: 10, border: "1.5px solid " + (smjenaFormNacin === NACIN_DRUGA ? "#008577" : "#e2eae6"), background: smjenaFormNacin === NACIN_DRUGA ? "#f0fdf4" : "white", cursor: "pointer" }}>
                <input type="radio" name="smjena_nacin" checked={smjenaFormNacin === NACIN_DRUGA} onChange={() => setSmjenaFormNacin(NACIN_DRUGA)} style={{ marginTop: 3, accentColor: "#008577" }} />
                <div>
                  <strong style={{ fontSize: 14, color: "#173d31", display: "block" }}>Druga smjena (ručno)</strong>
                  <span style={{ fontSize: 12, color: "#555" }}>Uvijek računa kao II smjenu bez obzira na trenutno vrijeme.</span>
                </div>
              </label>
            </div>

            <div style={{ background: "#f8faf9", border: "1px solid #e2eae6", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#233b33" }}>Podešavanje radnog vremena I smjene</div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <label htmlFor="smjena-od" style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>Od (početak):</label>
                  <input id="smjena-od" type="time" value={smjenaFormOd} onChange={(e) => setSmjenaFormOd(e.target.value || "05:00")} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", font: "inherit", fontSize: 14, outline: "none" }} />
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <label htmlFor="smjena-do" style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>Do (kraj):</label>
                  <input id="smjena-do" type="time" value={smjenaFormDo} onChange={(e) => setSmjenaFormDo(e.target.value || "15:00")} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", font: "inherit", fontSize: 14, outline: "none" }} />
                </div>
              </div>
              <span style={{ fontSize: 11, color: "#777", lineHeight: 1.3 }}>* II smjena obuhvata preostali dio dana ({smjenaFormDo} - {smjenaFormOd}).</span>
            </div>

            {smjenaConfig.updatedAt ? (
              <div style={{ fontSize: 11, color: "#777", textAlign: "center" }}>
                Poslednja izmjena: {formatLastChanged(smjenaConfig.updatedAt)}{smjenaConfig.updatedBy ? ` (${smjenaConfig.updatedBy})` : ""}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button type="button" onClick={() => setSmjenaModalOpen(false)} disabled={smjenaSaving} style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid #cbd5e1", background: "white", color: "#475569", font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Otkaži
              </button>
              <button type="button" onClick={handleSaveSmjena} disabled={smjenaSaving} style={{ padding: "9px 20px", borderRadius: 10, border: 0, background: "linear-gradient(115deg, #0b6b5b, #008577)", color: "white", font: "inherit", fontSize: 13, fontWeight: 700, cursor: smjenaSaving ? "wait" : "pointer", opacity: smjenaSaving ? 0.7 : 1, boxShadow: "0 4px 12px rgba(0,91,77,0.25)" }}>
                {smjenaSaving ? "Čuvanje…" : "Sačuvaj"}
              </button>
            </div>
          </div>
        </div>
      )}
    {toast && <div role="status" style={{ position: "fixed", zIndex: 100, left: "50%", bottom: 28, transform: "translateX(-50%)", background: "#222", color: "#fff", padding: "12px 18px", borderRadius: 24, boxShadow: "0 6px 22px #0004", whiteSpace: "nowrap" }}>{toast}</div>}
	</>
  );
}
