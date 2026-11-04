import "./globals.css";

export const metadata = {
  title: "Antellay AEGIS",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}