# WhatsApp Bulk Messenger

A [Next.js](https://nextjs.org/) web app to upload contacts from Excel, manage message templates, connect WhatsApp via QR code ([Baileys](https://github.com/WhiskeySockets/Baileys)), and send bulk messages in a guided flow.

## Features

- **Contacts** — Parse `.xlsx` files, pick a phone column, validate numbers.
- **Templates** — Create and select message templates for your campaign.
- **WhatsApp** — Server-side QR generation; session stored locally (see below).
- **Send** — Progress and controls for bulk sending to valid contacts.

## Tech stack

- Next.js 15 (App Router), React 19, TypeScript  
- Tailwind CSS v4, shadcn-style UI (Radix)  
- Baileys, `xlsx`, `qrcode`

## Requirements

- **Node.js** 18+ (20+ recommended)  
- **npm** (or pnpm / yarn)

## Getting started

```bash
git clone https://github.com/AjGaht/Whatsapp-Bulk-Messanger.git
cd Whatsapp-Bulk-Messanger
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command        | Description              |
| -------------- | ------------------------ |
| `npm run dev`  | Development server       |
| `npm run build`| Production build         |
| `npm run start`| Run production server    |
| `npm run lint` | ESLint (Next.js config)  |

## Session data

WhatsApp credentials are stored on disk under `auth_info_baileys/` (ignored by Git). Do not commit or share that folder.

## Production

```bash
npm run build
npm run start
```

Use a long-lived Node host (WhatsApp needs a persistent server process). Review your platform’s timeouts and WebSocket/SSE behavior if you deploy behind a reverse proxy.

## Compliance

Bulk messaging may be restricted by [WhatsApp’s terms](https://www.whatsapp.com/legal) and local law. Use this tool only for legitimate, opted-in recipients you are allowed to contact.

## License

Private / unlicensed unless you add a license file.
