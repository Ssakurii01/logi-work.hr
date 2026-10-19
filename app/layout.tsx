import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FleetOps HR Workforce",
  description: "Secure HR and recruiter attendance, task evidence, review, and performance reporting for logistics companies.",
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
