import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCC8B_uALWwF-iC3FDkxKGsw4MIQENYFfE",
  authDomain: "ansara-fpl-live.firebaseapp.com",
  databaseURL: "https://ansara-fpl-live-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ansara-fpl-live",
  storageBucket: "ansara-fpl-live.firebasestorage.app",
  messagingSenderId: "556574266774",
  appId: "1:556574266774:web:592360da2f2f341a7c39b7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

function ensureAudienceBar() {
  let bar = document.getElementById("liveAudienceBar");
  if (bar) return bar;

  const style = document.createElement("style");
  style.textContent = `
    .live-audience-wrap {
      padding: 0 24px;
      margin: 2px auto 10px;
      max-width: 1180px;
      box-sizing: border-box;
    }

    .live-audience-bar {
      min-height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      flex-wrap: wrap;
      padding: 9px 14px;
      border: 1px solid #e2e6ed;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.84);
      color: #667085;
      font-size: 14px;
      line-height: 1.25;
      text-align: center;
      box-sizing: border-box;
    }

    .live-audience-bar strong {
      color: #111827;
      font-weight: 800;
    }

    .live-audience-dot {
      width: 9px;
      height: 9px;
      flex: 0 0 9px;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.12);
    }

    .live-audience-separator {
      color: #b5bcc8;
      margin: 0 1px;
    }

    .live-audience-bar.is-error .live-audience-dot {
      background: #9ca3af;
      box-shadow: none;
    }

    @media (max-width: 640px) {
      .live-audience-wrap {
        padding: 0 22px;
        margin-bottom: 8px;
      }

      .live-audience-bar {
        min-height: 40px;
        border-radius: 15px;
        font-size: 13px;
      }
    }
  `;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "live-audience-wrap";

  bar = document.createElement("div");
  bar.id = "liveAudienceBar";
  bar.className = "live-audience-bar";
  bar.setAttribute("aria-live", "polite");
  bar.innerHTML = `
    <span class="live-audience-dot" aria-hidden="true"></span>
    <span><strong id="onlineNowCount">—</strong> online now</span>
    <span class="live-audience-separator" aria-hidden="true">·</span>
    <span><strong id="visitorsTodayCount">—</strong> visitors today</span>
  `;

  wrap.appendChild(bar);

  const controlbar = document.querySelector(".controlbar");
  if (controlbar && controlbar.parentNode) {
    controlbar.insertAdjacentElement("afterend", wrap);
  } else {
    const shell = document.querySelector(".app-shell") || document.body;
    shell.prepend(wrap);
  }

  return bar;
}

const audienceBar = ensureAudienceBar();
const onlineEl = document.getElementById("onlineNowCount");
const visitorsEl = document.getElementById("visitorsTodayCount");

function setUnavailable() {
  audienceBar.classList.add("is-error");
  audienceBar.innerHTML = `
    <span class="live-audience-dot" aria-hidden="true"></span>
    <span>Live audience unavailable</span>
  `;
}

function malaysiaDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function countOnlineUsers(value) {
  if (!value || typeof value !== "object") return 0;

  return Object.values(value).reduce((count, connections) => {
    const isOnline =
      connections &&
      typeof connections === "object" &&
      Object.keys(connections).length > 0;

    return count + (isOnline ? 1 : 0);
  }, 0);
}

let stopTodayListener = null;
let activeDateKey = null;

function attachTodayVisitors(uid) {
  const dateKey = malaysiaDateKey();
  if (dateKey === activeDateKey) return;

  if (typeof stopTodayListener === "function") {
    stopTodayListener();
    stopTodayListener = null;
  }

  activeDateKey = dateKey;

  // One record per anonymous Firebase UID, so refreshes do not add another visit.
  const myVisitRef = ref(db, `visitors/${dateKey}/${uid}`);
  set(myVisitRef, true).catch((error) => {
    console.error("Visitor write failed:", error);
  });

  const todayRef = ref(db, `visitors/${dateKey}`);
  stopTodayListener = onValue(
    todayRef,
    (snapshot) => {
      visitorsEl.textContent = String(snapshot.numChildren());
    },
    (error) => {
      console.error("Visitors listener failed:", error);
      setUnavailable();
    }
  );
}

let audienceStarted = false;

function startRealtimeAudience(user) {
  if (audienceStarted) return;
  audienceStarted = true;

  const uid = user.uid;

  // Each open tab gets a separate connection child.
  // We still count unique UIDs, so multiple tabs from the same browser count as one user online.
  const connectedRef = ref(db, ".info/connected");
  const myConnectionsRef = ref(db, `presence/${uid}`);

  onValue(
    connectedRef,
    async (snapshot) => {
      if (snapshot.val() !== true) return;

      const connectionRef = push(myConnectionsRef);

      try {
        // Register cleanup first, then mark this connection online.
        await onDisconnect(connectionRef).remove();
        await set(connectionRef, true);
      } catch (error) {
        console.error("Presence write failed:", error);
      }
    },
    (error) => {
      console.error("Connection listener failed:", error);
      setUnavailable();
    }
  );

  const presenceRef = ref(db, "presence");
  onValue(
    presenceRef,
    (snapshot) => {
      onlineEl.textContent = String(countOnlineUsers(snapshot.val()));
    },
    (error) => {
      console.error("Presence listener failed:", error);
      setUnavailable();
    }
  );

  attachTodayVisitors(uid);

  // Switch the daily counter automatically at midnight Malaysia time.
  setInterval(() => attachTodayVisitors(uid), 60_000);
}

onAuthStateChanged(auth, (user) => {
  if (user) startRealtimeAudience(user);
});

signInAnonymously(auth).catch((error) => {
  console.error("Anonymous sign-in failed:", error);
  setUnavailable();
});
