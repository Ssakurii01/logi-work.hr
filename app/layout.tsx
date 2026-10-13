import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FleetOps Workforce",
  description: "Secure employee operations, attendance, tasks, and performance reporting.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
