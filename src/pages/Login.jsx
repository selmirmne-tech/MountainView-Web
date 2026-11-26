import { useCallback, useEffect, useRef, useState } from "react";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { child, get, set, update } from "firebase/database";
import { getToken } from "firebase/messaging";
import { useNavigate } from "react-router-dom";

import { auth, getMessagingSafe } from "../firebase/config";
import { usersRestoran } from "../firebase/refs";

const AUTO_LOGIN_EMAIL = "test@vasrestoran.com";
const AUTO_LOGIN_PASSWORD = "123456";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ime, setIme] = useState("");
  const [broj, setBroj] = useState("");
  const [titula, setTitula] = useState("Titula");
  const [mode, setMode] = useState("login");

  const navigate = useNavigate();
  const autoLoginStarted = useRef(false);

  const requestNotificationPermission = useCallback(async () => {
    try {
      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        !window.isSecureContext
      ) {
        return "unsupported";
      }

      if (Notification.permission === "default") {
        return await Notification.requestPermission();
      }

      return Notification.permission;
    } catch (error) {
      console.info("Obavještenja nisu dostupna u ovom browseru:", error);
      return "unsupported";
    }
  }, []);

  const saveFCMToken = useCallback(async (uid) => {
    try {
      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        Notification.permission !== "granted" ||
        !window.isSecureContext ||
        !("serviceWorker" in navigator)
      ) {
        return;
      }

      const [registration, messaging] = await Promise.all([
        navigator.serviceWorker.ready,
        getMessagingSafe(),
      ]);

      if (!messaging) return;

      const token = await getToken(messaging, {
        vapidKey:
          "BHe7nSvVdLbYzSKV1boLUgrj35JH5UrvIdP7HRsMn4E1B4nl19IXlDjiLg-OZHnN1_DmFAgfAX2atjsfdEGD-co",
        serviceWorkerRegistration: registration,
      });

      if (!token) return;

      await update(child(usersRestoran(), uid), { fcmToken: token });
    } catch (error) {
      // FCM nije potreban za prijavu; neki ugrađeni browseri ga ne podržavaju.
      console.info("FCM token nije sačuvan:", error);
    }
  }, []);

  const login = useCallback(
    async (emailToUse = email, passwordToUse = password, silent = false) => {
      try {
        const normalizedEmail = emailToUse.trim();
        if (!normalizedEmail) {
          if (!silent) alert("Unesite email");
          return;
        }

        // Poziv je prije prvog await-a kod ručne prijave, pa browser može
        // prikazati dozvolu nakon korisnikovog klika. Automatska prijava je ne traži.
        const notificationPermission = silent
          ? Promise.resolve(
              typeof window !== "undefined" && "Notification" in window
                ? Notification.permission
                : "unsupported"
            )
          : requestNotificationPermission();

        try {
          await setPersistence(auth, browserLocalPersistence);
        } catch (persistenceError) {
          // Ako Instagram/in-app browser blokira localStorage, prijava i dalje
          // može trajati do zatvaranja browser sesije.
          console.info("Local persistence nije dostupna; koristim memorijsku sesiju.", persistenceError);
          await setPersistence(auth, inMemoryPersistence);
        }

        const userCred = await signInWithEmailAndPassword(
          auth,
          normalizedEmail,
          passwordToUse
        );
        const uid = userCred.user.uid;
        const snapshot = await get(child(usersRestoran(), uid));

        if (!snapshot.exists()) {
          if (!silent) alert("Korisnik ne postoji u bazi.");
          return;
        }

        const fullUser = { ...snapshot.val(), uid };
        localStorage.setItem("user", JSON.stringify(fullUser));
        window.dispatchEvent(new Event("user-login"));
        navigate("/dashboard", { replace: true });

        // Token se čuva naknadno i nikada ne blokira prijavu.
        void notificationPermission.then((permission) => {
          if (permission === "granted") return saveFCMToken(uid);
          return undefined;
        });
      } catch (error) {
        console.error(silent ? "Automatska prijava nije uspjela:" : "LOGIN ERROR:", error);
        if (!silent) alert("Prijava nije uspjela: " + error.message);
      }
    },
    [email, password, navigate, requestNotificationPermission, saveFCMToken]
  );

  useEffect(() => {
    if (autoLoginStarted.current) return;
    autoLoginStarted.current = true;
    void login(AUTO_LOGIN_EMAIL, AUTO_LOGIN_PASSWORD, true);
  }, [login]);

  const register = async () => {
    try {
      const normalizedEmail = email.trim();
      if (!ime.trim() || !normalizedEmail || !password || !broj.trim()) {
        alert("Popuni sva polja");
        return;
      }

      if (titula === "Titula") {
        alert("Izaberi titulu");
        return;
      }

      const userCred = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );
      const uid = userCred.user.uid;

      // Lozinka se čuva u Firebase Authenticationu, ne u Realtime Database.
      const newUser = {
        uid,
        ime: ime.trim(),
        email: normalizedEmail,
        broj: broj.trim(),
        titula,
        fcmToken: "",
      };

      await set(child(usersRestoran(), uid), newUser);
      localStorage.setItem("user", JSON.stringify(newUser));
      window.dispatchEvent(new Event("user-login"));
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("REGISTER ERROR:", error);
      alert("Registracija nije uspjela: " + error.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-black to-neutral-900 px-4">
      <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
        <div className="mb-6 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-2xl py-3 font-semibold transition ${
              mode === "login"
                ? "bg-orange-500 text-black"
                : "bg-neutral-800 text-white"
            }`}
          >
            Login
          </button>

          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 rounded-2xl py-3 font-semibold transition ${
              mode === "register"
                ? "bg-orange-500 text-black"
                : "bg-neutral-800 text-white"
            }`}
          >
            Register
          </button>
        </div>

        {mode === "login" && (
          <div className="space-y-4">
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="w-full rounded-2xl bg-neutral-800 p-4 text-white outline-none focus:ring-2 focus:ring-orange-500"
            />

            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className="w-full rounded-2xl bg-neutral-800 p-4 text-white outline-none focus:ring-2 focus:ring-orange-500"
            />

            <button
              type="button"
              onClick={() => void login()}
              className="w-full rounded-2xl bg-orange-500 py-4 font-bold text-black transition active:scale-[0.98]"
            >
              LOGIN
            </button>
          </div>
        )}

        {mode === "register" && (
          <div className="space-y-4">
            <input
              type="text"
              autoComplete="name"
              value={ime}
              onChange={(event) => setIme(event.target.value)}
              placeholder="Ime i prezime"
              className="w-full rounded-2xl bg-neutral-800 p-4 text-white outline-none focus:ring-2 focus:ring-green-500"
            />

            <input
              type="tel"
              autoComplete="tel"
              value={broj}
              onChange={(event) => setBroj(event.target.value)}
              placeholder="Broj telefona"
              className="w-full rounded-2xl bg-neutral-800 p-4 text-white outline-none focus:ring-2 focus:ring-green-500"
            />

            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="w-full rounded-2xl bg-neutral-800 p-4 text-white outline-none focus:ring-2 focus:ring-green-500"
            />

            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className="w-full rounded-2xl bg-neutral-800 p-4 text-white outline-none focus:ring-2 focus:ring-green-500"
            />

            <select
              value={titula}
              onChange={(event) => setTitula(event.target.value)}
              className="w-full rounded-2xl bg-neutral-800 p-4 text-white outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="Titula">Izaberi titulu</option>
              <option value="Konobar">Konobar</option>
              <option value="Kuhinja">Kuhinja</option>
              <option value="Sank">Šank</option>
            </select>

            <button
              type="button"
              onClick={() => void register()}
              className="w-full rounded-2xl bg-green-500 py-4 font-bold text-black transition active:scale-[0.98]"
            >
              REGISTER
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
