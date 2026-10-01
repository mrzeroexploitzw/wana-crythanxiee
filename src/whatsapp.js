```js
export async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

  sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu(config.botName),
    logger: P({ level: process.env.LOG_LEVEL || "info" }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  let pairingRequested = false;

  /*
   * REQUEST PAIRING CODE
   *
   * Do this during the initial connection, not after "open".
   * A small delay gives the WhatsApp socket time to establish
   * the transport before requestPairingCode() is called.
   */
  const requestInitialPairingCode = async () => {
    if (pairingRequested) return;
    if (!config.pairingNumber) return;
    if (state.creds.registered) return;

    pairingRequested = true;

    try {
      const number = String(config.pairingNumber)
        .replace(/\D/g, "");

      if (!number) {
        throw new Error("Invalid pairing number.");
      }

      console.log(
        `Requesting WhatsApp pairing code for ${number}...`
      );

      // Important: give the socket time to initialize.
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Socket may have closed during the delay.
      if (!sock) {
        throw new Error("WhatsApp socket is unavailable.");
      }

      const code = await sock.requestPairingCode(number);

      console.log("");
      console.log("======================================");
      console.log(" BEAUTXIE AI WHATSAPP PAIRING CODE");
      console.log("======================================");
      console.log(` CODE: ${code}`);
      console.log("======================================");
      console.log("");
      console.log(
        "On WhatsApp: Linked Devices -> Link a Device -> Link with phone number instead"
      );
      console.log("");
    } catch (e) {
      pairingRequested = false;
      console.error("pairing code:", e);
    }
  };

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg);
      } catch (e) {
        console.error("message handler:", e);
      }
    }
  });

  sock.ev.on("group-participants.update", async event => {
    try {
      await handleGroupParticipants(sock, event);
    } catch (e) {
      console.error("group event:", e);
    }
  });

  sock.ev.on("connection.update", async update => {
    const { connection, lastDisconnect, qr } = update;

    /*
     * Initial pairing:
     *
     * QR is emitted during the initial connection process.
     * Use it as the signal that the socket has started
     * communicating with WhatsApp.
     */
    if (
      !state.creds.registered &&
      config.pairingNumber &&
      qr
    ) {
      await requestInitialPairingCode();
    }

    /*
     * Some Baileys versions/configurations may not emit
     * a QR event when pairing mode is being used.
     *
     * Therefore also handle the connecting state.
     */
    if (
      !state.creds.registered &&
      config.pairingNumber &&
      connection === "connecting"
    ) {
      await requestInitialPairingCode();
    }

    if (connection === "open") {
      connectedAt = Date.now();

      console.log("BEAUTXIE AI connected.");
      console.log(
        `WhatsApp account connected successfully.`
      );
    }

    if (connection === "close") {
      connectedAt = null;

      const code =
        new Boom(lastDisconnect?.error)
          ?.output
          ?.statusCode;

      console.error(
        `BEAUTXIE AI WhatsApp connection closed. Code: ${code}`
      );

      if (code !== DisconnectReason.loggedOut) {
        console.log(
          "Reconnecting BEAUTXIE AI in 5 seconds..."
        );

        setTimeout(() => {
          startWhatsApp().catch(err => {
            console.error(
              "WhatsApp restart failed:",
              err
            );
          });
        }, 5000);
      } else {
        console.error(
          "WhatsApp session logged out. Re-pair the account."
        );
      }
    }
  });

  return sock;
}
```
