const fs = require("fs");
const path = require("path");
const pino = require("pino");
const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const AUTH_DIR = path.join(__dirname, "..", "auth_session");
const CREDS_PATH = path.join(AUTH_DIR, "creds.json");
const logger = pino({ level: "silent" });

let sock = null;
let qrCode = null;
let connection = "close";
let connecting = false;
let connectPromise = null;
let sockGeneration = 0;

function authExists() {
  return fs.existsSync(CREDS_PATH);
}

function teardownSock(oldSock) {
  if (!oldSock) return;
  try {
    oldSock.ev.removeAllListeners("connection.update");
    oldSock.ev.removeAllListeners("creds.update");
    oldSock.end(undefined);
  } catch (_) {}
}

function waitForQRorOpen(timeout, gen) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    if (gen !== sockGeneration) {
      return reject(new Error("Koneksi digantikan"));
    }
    if (connection === "open" && sock) return resolve("open");
    if (qrCode) return resolve("qr");

    const timer = setInterval(() => {
      if (gen !== sockGeneration) {
        clearInterval(timer);
        return reject(new Error("Koneksi digantikan"));
      }
      if (connection === "open" && sock) {
        clearInterval(timer);
        resolve("open");
      } else if (qrCode) {
        clearInterval(timer);
        resolve("qr");
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        reject(new Error("Timeout menunggu QR / koneksi WhatsApp"));
      }
    }, 250);
  });
}

async function ensureConnection() {
  if (connection === "open" && sock && authExists()) {
    return { sock, state: "open" };
  }

  if (connecting && connectPromise) {
    return connectPromise;
  }

  if (qrCode && sock && connection !== "close") {
    return { sock, state: "qr" };
  }

  connecting = true;
  qrCode = null;

  connectPromise = (async () => {
    const oldSock = sock;
    sock = null;
    connection = "connecting";
    const gen = ++sockGeneration;
    teardownSock(oldSock);

    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const newSock = makeWASocket({
      version,
      logger,
      auth: state,
      printQRInTerminal: false,
      browser: ["Visit Tracker", "Chrome", "1.0.0"],
    });
    sock = newSock;

    newSock.ev.on("creds.update", (c) => {
      if (gen !== sockGeneration) return;
      saveCreds(c).catch(() => {});
    });

    newSock.ev.on("connection.update", (update) => {
      if (gen !== sockGeneration) return;

      const { lastDisconnect, qr } = update;
      if (update.connection) connection = update.connection;

      if (qr) {
        qrCode = qr;
        console.log("[WA] QR baru dihasilkan — silakan scan");
      }

      if (connection === "open") {
        qrCode = null;
        connecting = false;
        console.log("[WA] Terhubung");
      }

      if (connection === "close") {
        connecting = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;

        if (loggedOut || !authExists()) {
          console.log("[WA] Session tidak valid — siapkan QR baru");
          sock = null;
          qrCode = null;
          connection = "close";
        } else if (gen === sockGeneration) {
          console.log("[WA] Terputus, coba ulang 3 detik...");
          setTimeout(() => {
            if (gen === sockGeneration) {
              ensureConnection().catch(() => {});
            }
          }, 3000);
        }
      }
    });

    try {
      const ready = await waitForQRorOpen(45000, gen);
      return { sock, state: ready };
    } finally {
      if (gen === sockGeneration) {
        connecting = false;
        connectPromise = null;
      }
    }
  })();

  try {
    return await connectPromise;
  } catch (err) {
    connecting = false;
    connectPromise = null;
    throw err;
  }
}

async function forceReconnect() {
  const oldSock = sock;
  sock = null;
  qrCode = null;
  connection = "close";
  connecting = false;
  connectPromise = null;
  sockGeneration++;
  teardownSock(oldSock);
  return ensureConnection();
}

async function status() {
  if (connection === "open" && sock && authExists()) {
    return { state: "open" };
  }

  if (connection === "open" && !authExists()) {
    await forceReconnect();
    if (connection === "open") return { state: "open" };
    if (qrCode) return { state: "qr" };
    return { state: "qr" };
  }

  try {
    const r = await ensureConnection();
    if (r.state === "open") return { state: "open" };
    if (qrCode) return { state: "qr" };
  } catch (_) {}

  if (qrCode) return { state: "qr" };
  return { state: connecting ? "connecting" : "closed" };
}

async function getQR() {
  if (connection === "open" && sock && authExists()) {
    return null;
  }

  if (qrCode) {
    return qrCode;
  }

  try {
    await ensureConnection();
  } catch (_) {}

  return qrCode;
}

async function reset() {
  await forceReconnect();
  if (connection === "open") return { state: "open" };
  return { state: qrCode ? "qr" : "connecting" };
}

async function sendText(targetNumber, text) {
  if (connection !== "open" || !sock || !authExists()) {
    const r = await ensureConnection();
    if (r.state !== "open") {
      throw new Error("WhatsApp belum terhubung. Scan QR dulu.");
    }
  }
  if (connection !== "open" || !sock) {
    throw new Error("WhatsApp belum terhubung. Scan QR dulu.");
  }
  const jid = `${String(targetNumber).replace(/\D/g, "")}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text });
  return { sent: true };
}

module.exports = { status, getQR, sendText, reset };
