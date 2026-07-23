import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Aura Coffee - Admin Dashboard",
  description: "Manager and Cashier dashboard for Aura Coffee",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <Providers>
          {children}
        </Providers>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
