import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "childcaredoctrain.com | Document Control & Staff Training",
  description: "Controlled child care documents, current-revision staff training, and certification reminders.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
