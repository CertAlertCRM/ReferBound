import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { APP_CONFIG } from "@/lib/config";
import { UIProvider } from "./ui";

// Variable Inter with optical sizing — the display cut at large sizes is
// noticeably tighter and more confident than the static text cut.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: `${APP_CONFIG.productName} — Live referral tracking`,
  description: "Real-time referral tracking between insurance agents and their partners.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_CONFIG.productName,
  },
};

export const viewport: Viewport = {
  themeColor: "#2547eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <UIProvider>{children}</UIProvider>
      </body>
    </html>
  );
}
