import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = { title: "BookPal" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const appearance = (await cookies()).get("bookpal-appearance")?.value;
  const theme = appearance === "light" || appearance === "dark" ? appearance : undefined;
  return (
    <html lang="en" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
