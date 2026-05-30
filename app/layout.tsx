import "./globals.css";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Chrome from "./components/Chrome";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Underhack — Breach Monitor",
  description: "Autonomous security-breach monitoring for enterprise systems",
};

const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('theme')||'system';var d=p==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;document.documentElement.dataset.theme=d;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <div className="frame">
          <Chrome email={user?.email ?? null} />
          {children}
        </div>
      </body>
    </html>
  );
}
