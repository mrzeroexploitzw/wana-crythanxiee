# BEAUTXIE AI — Media Downloader & Group Bot

Standalone WhatsApp bot with:
- branded response cards
- YouTube/TikTok/Facebook/Instagram/X/Pinterest and other public media through yt-dlp
- direct media URLs
- Play Store app information
- public Uptodown page extraction where a public APK link is exposed
- group management and moderation
- welcome/goodbye
- owner-only controls
- dedicated pairing-group restriction
- queue, cache, rate limiting and automatic cleanup
- Render Docker deployment

## Important
Use the bot only with content and sources you are authorized to access. This project does not implement DRM bypass, private-content access, or Meta enforcement evasion.

## Local setup

1. Install Node.js 20+ and Docker if desired.
2. Copy `.env.example` to `.env`.
3. Set `OWNER_NUMBER` using country code without `+`.
4. Set `GROUP_LINK`.
5. Run:
   `npm install`
   `npm start`

## Render

Push the project to GitHub, create a Render Blueprint from `render.yaml`, then supply the secret values in the Render dashboard. The blueprint attaches `/var/data` as persistent storage so WhatsApp auth survives restarts.

## Pairing

For first connection, set `PAIRING_NUMBER` and use the pairing-code endpoint from the protected owner panel, or run the included pairing command in the dedicated pairing group after the account is connected. Once authenticated, credentials are stored under `/var/data/auth`.

## Main commands

/menu
/help
/ping
/status
/owner
/download <url>
/video <url>
/audio <url>
/image <url>
/info <url>
/formats <url>
/apps <play-store-or-uptodown-url>

/pair
/unpair
/reconnect
/session
/sessions
/setpairgroup

/welcome on|off
/goodbye on|off
/rules
/setrules
/admins
/tagadmins
/groupinfo
/promote @user
/demote @user
/kick @user
/mute @user
/unmute @user
/warn @user
/warnings @user
/resetwarn @user
/antilink on|off
/antispam on|off
/antiflood on|off

/bot on|off
/setbotname
/setbotimage
/setdescription
/setprefix
/setgrouplink
/addowner
/delowner
/stats
/logs

The bot does not attempt to disguise itself as a human or evade platform enforcement.
