import Script from "next/script";
import { StackProvider, StackTheme } from "@stackframe/stack";
import { stackServerApp } from "./stack";

export const metadata = { title: "Luku — AI Finnish Reader" };

export default function RootLayout({ children }) {
  return (
    <html lang="fi">
      <body style={{ margin: 0, padding: 0 }}>
        <StackProvider app={stackServerApp}>
          <StackTheme>
            {children}
          </StackTheme>
        </StackProvider>
        <Script src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
