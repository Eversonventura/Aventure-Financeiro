import type { Metadata, Viewport } from "next";
import { Anton, Fredoka, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const space = Space_Grotesk({ variable: "--font-space", subsets: ["latin"] });
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"] });
const anton = Anton({ variable: "--font-anton", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Aventure Financeiro",
  description: "Caixa único da família e da Aventure",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Financeiro", statusBarStyle: "black" },
};

export const viewport: Viewport = { themeColor: "#0b0b10" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${space.variable} ${anton.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink">{children}
        <RegisterSW />
      </body>
    </html>
  );
}
