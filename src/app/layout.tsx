// src/app/layout.tsx
import type { Metadata } from "next";
// --- SWITCH FONT IMPORT ---
// Switch to Inter font from Google Fonts
import { Inter } from "next/font/google";
// --- END FONT IMPORT ---
import "./globals.css";

// --- Initialize Inter font ---
const inter = Inter({
  subsets: ["latin"],
  // Add variable if you want to use CSS variables, otherwise remove/comment out
  // variable: '--font-inter',
});
// --- END FONT INIT ---

// Keep the updated metadata
export const metadata: Metadata = {
  title: "AI Code Refactor Tutor",
  description: "Get AI-powered refactoring suggestions for your JavaScript/React code and apply fixes automatically.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Apply Inter font className to the body */}
      {/* Remove antialiased if Inter doesn't require it or handle in globals.css */}
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
