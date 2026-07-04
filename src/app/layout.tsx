import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { isOwner } from "@/lib/supabase-server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PaperPicks",
  description: "Your weekly, curated AI research papers — important, not random.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const owner = await isOwner();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-3xl items-center gap-5 px-5 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              📚 PaperPicks
            </Link>
            <nav className="flex gap-4 text-sm text-zinc-500">
              <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">This Week</Link>
              <Link href="/for-you" className="hover:text-zinc-900 dark:hover:text-zinc-100">For You</Link>
              <Link href="/search" className="hover:text-zinc-900 dark:hover:text-zinc-100">Search</Link>
            </nav>
            <div className="ml-auto text-sm text-zinc-500">
              {owner ? (
                <form action="/auth/signout" method="post">
                  <button type="submit" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                    Sign out
                  </button>
                </form>
              ) : (
                <Link href="/login" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
