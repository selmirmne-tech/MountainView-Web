import { useEffect, useRef, useState } from "react";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { child, get, set, update } from "firebase/database";
import { useNavigate } from "react-router-dom";

import { auth, getMessagingSafe } from "../firebase/config";
import { usersRestoran } from "../firebase/refs";
import { getToken } from "firebase/messaging";

const TEST_EMAIL = "test@vasrestoran.com";
const TEST_PASSWORD = "123456";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [ime, setIme] = useState("");
  const [broj, setBroj] = useState("");
  const [titula, setTitula] = useState("Titula");
  const [mode, setMode] = useState("login");

  const navigate = useNavigate();
  const autoLoginStarted = useRef(false);

  const saveFCMToken = async (uid) => {
    try {
      if (
        typeof Notification === "undefined" ||
        !("serviceWorker" in navigator)
      ) {
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      const messaging = await getMessagingSafe();

      if (!messaging) return;

      const token = await getToken(messaging, {
        vapidKey:
          "BHe7nSvVdLbYzSKV1boLUgrj35JH5UrvIdP7HRsMn4E1B4nl19IXlDjiLg-OZHnN1_DmFAgfAX2atjsfdEGD-co",
        serviceWorkerRegistration: registration,
      });

      if (!token) return;

      await update(child(usersRestoran(), uid), {
        fcmToken: token,
      });
    } catch (error) {
      console.error("FCM greška:", error);
    }
  };

  const login = async (
    emailZaPrijavu = email,
    lozinkaZaPrijavu = password,
    tihaPrijava = false
  ) => {
    try {
      const normalizedEmail = emailZaPrijavu.trim();

      if (!normalizedEmail) {
        if (!tihaPrijava) alert("Unesite email");
        return;
      }

      await setPersistence(auth, browserLocalPersistence);

      const userCred = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        lozinkaZaPrijavu
      );

      const uid = userCred.user.uid;
      const snapshot = await get(child(usersRestoran(), uid));

      if (!snapshot.exists()) {
        if (!tihaPrijava) alert("Korisnik ne postoji u bazi.");
        return;
      }

      const fullUser = {
        ...snapshot.val(),
        uid,
      };

      localStorage.setItem("user", JSON.stringify(fullUser));
      window.dispatchEvent(new Event("user-login"));

      // Token se pokušava sačuvati bez blokiranja prijave.
      window.setTimeout(() => {
        void saveFCMToken(uid);
      }, 500);

      navigate("/dashboard");
    } catch (error) {
      console.error("LOGIN ERROR:", error);

      if (!tihaPrijava) {
        alert("Prijava nije uspjela: " + error.message);
      } else {
        console.error("Automatska prijava nije uspjela.");
      }
    }
  };

  useEffect(() => {
    if (autoLoginStarted.current) return;

    autoLoginStarted.current = true;
    void login(TEST_EMAIL, TEST_PASSWORD, true);
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

      // Lozinka se ne čuva u Realtime Database; Firebase Auth je čuva.
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

      navigate("/dashboard");
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