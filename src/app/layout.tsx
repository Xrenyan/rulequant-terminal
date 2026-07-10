import type { Metadata, Viewport } from "next";
import { PrivateAccessGate } from "@/components/private-access-gate";
import "./globals.css";

export const metadata: Metadata = {
  title: "RuleQuant 回测终端",
  description: "规则型开奖数据公式回测系统",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-snippet": -1,
      "max-image-preview": "none",
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">
        <PrivateAccessGate>{children}</PrivateAccessGate>
      </body>
    </html>
  );
}
