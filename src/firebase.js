import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported as analyticsIsSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDbkQymbqxY6_BnkJCvVHh9NHzCSUtJWgs",
  authDomain: "p-key-a3w68ys6itda.firebaseapp.com",
  projectId: "p-key-a3w68ys6itda",
  storageBucket: "p-key-a3w68ys6itda.firebasestorage.app",
  messagingSenderId: "1037810531704",
  appId: "1:1037810531704:web:681d53a7eab8c1aff85c8d",
  measurementId: "G-LMK2C8MTWW"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

analyticsIsSupported()
  .then((ok) => { if (ok) getAnalytics(app); })
  .catch(() => {});

export { firebaseConfig };
