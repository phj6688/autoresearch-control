import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const jetbrainsMono = localFont({
  src: [
    {
      path: "../../public/fonts/JetBrainsMono-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/fonts/JetBrainsMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/JetBrainsMono-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/JetBrainsMono-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Autoresearch Mission Control",
};

const themeScript = `(function(){try{var t=localStorage.getItem("theme");var c=(t==="light"||t==="dark")?t:(window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light");document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(c)}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        suppressHydrationWarning
        className={`${jetbrainsMono.variable} font-[family-name:var(--font-jetbrains-mono)] bg-[var(--color-bg)] text-[var(--color-text-primary)] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
