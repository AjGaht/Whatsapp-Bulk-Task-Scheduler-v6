import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: [
    "@whiskeysockets/baileys",
    "pino",
    "qrcode",
    "thread-stream",
  ],
};

export default nextConfig;
