import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SaleGuard",
  description: "AI-powered sales call QA scoring pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="min-h-screen bg-background text-foreground">
          <nav className="border-b bg-card">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex h-16 items-center justify-between">
                <div className="flex items-center gap-8">
                  <Link href="/" className="text-xl font-bold text-primary">
                    SaleGuard
                  </Link>
                  <div className="flex gap-6">
                    <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-primary">
                      Dashboard
                    </Link>
                    <Link href="/leads" className="text-sm font-medium text-muted-foreground hover:text-primary">
                      Leads
                    </Link>
                    <Link href="/checks" className="text-sm font-medium text-muted-foreground hover:text-primary">
                      Check Library
                    </Link>
                    <Link href="/admin" className="text-sm font-medium text-muted-foreground hover:text-primary">
                      Admin
                    </Link>
                  </div>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </nav>
          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
