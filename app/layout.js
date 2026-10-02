import './globals.css';

export const metadata = {
  title: 'Mini POS',
  description: 'Simple point of sale demo',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
