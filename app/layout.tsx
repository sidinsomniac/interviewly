import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Medha",
  description: "AI-driven Teams interviewer — generates PS probe forms automatically",
  // Round-4 (2026-06-01) — favicon. PNG (no SVG variant exists).
  icons: { icon: "/images/medha_logo_color.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="font-sans min-h-screen text-[color:var(--medha-text-primary)]">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
