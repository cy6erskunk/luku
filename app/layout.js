export const metadata = { title: "Luku — AI Finnish Reader" };

export default function RootLayout({ children }) {
  return (
    <html lang="fi">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
