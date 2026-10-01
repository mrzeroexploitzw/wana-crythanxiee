```js
import fs from "node:fs";

import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

import P from "pino";
import { Boom } from "@hapi/boom";

import { config } from "./config.js";
import { brandImageBuffer } from "./cards.js";
import {
  handleMessage,
  handleGroupParticipants
} from "./commands.js";

let sock = null;
let connectedAt = null;
let reconnectTimer = null;
let starting = false;


/*
 * ============================================================
 * START WHATSAPP
 * ============================================================
 */

export async function startWhatsApp() {
  if (starting) {
    console.log("WhatsApp startup already in progress.");
    return sock;
  }

  starting = true;

  try {
    const auth = await useMultiFileAuthState(
      config.authDir
    );

    const state = auth.state;
    const saveCreds = auth.saveCreds;

    sock = makeWASocket({
      auth: state,

      browser: Browsers.ubuntu(
        config.botName || "BEAUTXIE AI"
      ),

      logger: P({
        level: process.env.LOG_LEVEL || "info"
      }),

      markOnlineOnConnect: false,
      syncFullHistory: false,
      printQRInTerminal: false
    });

    /*
     * Save WhatsApp credentials.
     */

    sock.ev.on(
      "creds.update",
      saveCreds
    );


    /*
     * ========================================================
     * MESSAGES
     * ========================================================
     */

    sock.ev.on(
      "messages.upsert",
      async ({ messages }) => {
        for (const msg of messages) {
          try {
            await handleMessage(
              sock,
              msg
            );
          } catch (error) {
            console.error(
              "Message handler error:",
              error
            );
          }
        }
      }
    );


    /*
     * ========================================================
     * GROUP PARTICIPANTS
     * ========================================================
     */

    sock.ev.on(
      "group-participants.update",
      async (event) => {
        try {
          await handleGroupParticipants(
            sock,
            event
          );
        } catch (error) {
          console.error(
            "Group event error:",
            error
          );
        }
      }
    );


    /*
     * ========================================================
     * CONNECTION
     * ========================================================
     */

    sock.ev.on(
      "connection.update",
      async (update) => {
        const {
          connection,
          lastDisconnect
        } = update;


        /*
         * ----------------------------------------------------
         * CONNECTED
         * ----------------------------------------------------
         */

        if (connection === "open") {
          connectedAt = Date.now();

          console.log("");
          console.log(
            "======================================"
          );
          console.log(
            " BEAUTXIE AI"
          );
          console.log(
            " WhatsApp connection established"
          );
          console.log(
            "======================================"
          );
          console.log("");
        }


        /*
         * ----------------------------------------------------
         * DISCONNECTED
         * ----------------------------------------------------
         */

        if (connection === "close") {
          connectedAt = null;

          let statusCode = null;

          try {
            statusCode =
              new Boom(
                lastDisconnect?.error
              ).output?.statusCode;
          } catch (error) {
            statusCode = null;
          }

          console.error(
            "WhatsApp connection closed."
          );

          console.error(
            "Disconnect status:",
            statusCode
          );


          /*
           * Logged out.
           */

          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {
            console.error(
              "WhatsApp session logged out."
            );

            console.error(
              "The account must be paired again."
            );

            return;
          }


          /*
           * Prevent multiple reconnect timers.
           */

          if (reconnectTimer) {
            return;
          }

          console.log(
            "Reconnecting WhatsApp in 5 seconds..."
          );

          reconnectTimer = setTimeout(
            async () => {
              reconnectTimer = null;

              try {
                await startWhatsApp();
              } catch (error) {
                console.error(
                  "WhatsApp reconnect failed:",
                  error
                );
              }
            },
            5000
          );
        }
      }
    );


    /*
     * ========================================================
     * INITIAL PAIRING
     * ========================================================
     */

    if (
      config.pairingNumber &&
      state.creds.registered === false
    ) {
      const number =
        String(config.pairingNumber)
          .replace(/\D/g, "");

      if (!number) {
        console.error(
          "Invalid pairing number."
        );
      } else {
        console.log(
          "WhatsApp account is not registered."
        );

        console.log(
          "Preparing pairing code..."
        );


        /*
         * Give the socket time to initialize.
         */

        setTimeout(
          async () => {
            try {
              if (!sock) {
                console.error(
                  "WhatsApp socket unavailable."
                );
                return;
              }

              if (state.creds.registered) {
                console.log(
                  "Account already registered."
                );
                return;
              }

              console.log(
                "Requesting WhatsApp pairing code..."
              );

              const code =
                await sock.requestPairingCode(
                  number
                );

              console.log("");
              console.log(
                "======================================"
              );
              console.log(
                " BEAUTXIE AI PAIRING CODE"
              );
              console.log(
                "======================================"
              );
              console.log(
                "CODE:",
                code
              );
              console.log(
                "======================================"
              );
              console.log("");

              console.log(
                "Open WhatsApp on the phone."
              );

              console.log(
                "Go to Linked Devices."
              );

              console.log(
                "Choose Link a Device."
              );

              console.log(
                "Choose Link with phone number instead."
              );

              console.log(
                "Enter the pairing code above."
              );

              console.log("");
            } catch (error) {
              console.error(
                "Pairing code request failed:",
                error
              );
            }
          },
          5000
        );
      }
    }

    return sock;

  } finally {
    starting = false;
  }
}


/*
 * ============================================================
 * GET SOCKET
 * ============================================================
 */

export function getSocket() {
  return sock;
}


/*
 * ============================================================
 * GROUP INVITE
 * ============================================================
 */

export async function resolveGroupInvite(input) {
  if (!sock) {
    throw new Error(
      "WhatsApp is not connected."
    );
  }

  const value =
    String(input || "").trim();

  const match =
    value.match(
      /chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i
    );

  const code = match
    ? match[1]
    : value
        .replace(/^https?:\/\//i, "")
        .split(/[/?#&]/)[0];

  if (!code) {
    throw new Error(
      "Invalid WhatsApp group invite link/code."
    );
  }

  const info =
    await sock.groupGetInviteInfo(
      code
    );

  return {
    ...info,
    inviteCode: code,
    jid: info.id || info.jid
  };
}


/*
 * ============================================================
 * UPTIME
 * ============================================================
 */

export function getUptime() {
  if (!connectedAt) {
    return "offline";
  }

  const seconds =
    Math.floor(
      (Date.now() - connectedAt) / 1000
    );

  const hours =
    Math.floor(
      seconds / 3600
    );

  const minutes =
    Math.floor(
      (seconds % 3600) / 60
    );

  const secs =
    seconds % 60;

  return (
    String(hours) +
    "h " +
    String(minutes) +
    "m " +
    String(secs) +
    "s"
  );
}


/*
 * ============================================================
 * BRANDED CARD
 * ============================================================
 */

export async function sendBrandedCard(
  jid,
  caption,
  options = {}
) {
  if (!sock) {
    throw new Error(
      "WhatsApp is not connected."
    );
  }

  const image =
    brandImageBuffer();

  const payload = image
    ? {
        image,
        caption,
        ...(options.mentions?.length
          ? {
              mentions:
                options.mentions
            }
          : {})
      }
    : {
        text: caption,
        ...(options.mentions?.length
          ? {
              mentions:
                options.mentions
            }
          : {})
      };

  if (options.quoted) {
    return sock.sendMessage(
      jid,
      payload,
      {
        quoted:
          options.quoted
      }
    );
  }

  return sock.sendMessage(
    jid,
    payload
  );
}


/*
 * ============================================================
 * SEND TEXT
 * ============================================================
 */

export async function sendText(
  jid,
  text
) {
  if (!sock) {
    throw new Error(
      "WhatsApp is not connected."
    );
  }

  return sock.sendMessage(
    jid,
    {
      text: String(text)
    }
  );
}


/*
 * ============================================================
 * SEND FILE
 * ============================================================
 */

export async function sendFile(
  jid,
  file,
  caption,
  mimetype =
    "application/octet-stream"
) {
  if (!sock) {
    throw new Error(
      "WhatsApp is not connected."
    );
  }

  return sock.sendMessage(
    jid,
    {
      document: {
        url: file
      },
      mimetype,
      fileName:
        String(file)
          .split(/[\\/]/)
          .pop(),
      caption:
        caption || ""
    }
  );
}


/*
 * ============================================================
 * SEND MEDIA
 * ============================================================
 */

export async function sendMedia(
  jid,
  file,
  caption,
  type = "video"
) {
  if (!sock) {
    throw new Error(
      "WhatsApp is not connected."
    );
  }

  const data =
    fs.readFileSync(file);

  let payload;

  if (type === "audio") {
    payload = {
      audio: data,
      mimetype: "audio/mpeg",
      ptt: false
    };
  } else if (type === "image") {
    payload = {
      image: data
    };
  } else {
    payload = {
      video: data
    };
  }

  if (caption) {
    payload.caption =
      caption;
  }

  return sock.sendMessage(
    jid,
    payload
  );
}


/*
 * ============================================================
 * GROUP METADATA
 * ============================================================
 */

export async function groupMetadata(jid) {
  if (!sock) {
    throw new Error(
      "WhatsApp is not connected."
    );
  }

  return sock.groupMetadata(jid);
}


/*
 * ============================================================
 * PROFILE PICTURE
 * ============================================================
 */

export async function updateProfilePicture(
  jid,
  file
) {
  if (!sock) {
    throw new Error(
      "WhatsApp is not connected."
    );
  }

  const data =
    fs.readFileSync(file);

  return sock.updateProfilePicture(
    jid,
    {
      url: data
    }
  );
}


/*
 * ============================================================
 * MANUAL PAIRING CODE
 * ============================================================
 */

export async function requestPairingCode(
  number
) {
  if (!sock) {
    throw new Error(
      "WhatsApp is not connected."
    );
  }

  const cleanNumber =
    String(number || "")
      .replace(/\D/g, "");

  if (!cleanNumber) {
    throw new Error(
      "Invalid WhatsApp phone number."
    );
  }

  return sock.requestPairingCode(
    cleanNumber
  );
}
```
