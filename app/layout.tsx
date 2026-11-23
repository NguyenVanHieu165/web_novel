import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Noto_Serif } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const readerSans = Inter({
  variable: "--font-reader-sans",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const readerSerif = Noto_Serif({
  variable: "--font-reader-serif",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "La Ca Truyện",
    template: "%s | La Ca Truyện",
  },
  description:
    "La Ca Truyện là nền tảng đọc truyện chữ trực tuyến miễn phí với kho truyện phong phú và trải nghiệm đọc tối ưu.",
  applicationName: "La Ca Truyện",
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: "/",
    siteName: "La Ca Truyện",
    title: "La Ca Truyện",
    description:
      "Đọc truyện chữ trực tuyến miễn phí với kho truyện phong phú tại La Ca Truyện.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} ${readerSans.variable} ${readerSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
