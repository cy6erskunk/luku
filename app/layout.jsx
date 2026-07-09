import Script from "next/script";
import "./globals.css";

export const metadata = { title: "Luku — AI Finnish Reader" };

export default function RootLayout({ children }) {
  return (
    <html lang="fi">
      <body>
        {children}
        <Script src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
