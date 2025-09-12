import { Inter } from "next/font/google";
import SetupChecker from "./components/SetupChecker";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "FIDC IJJ",
  description: "Gestão de Desconto de Duplicatas",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-br" className="bg-gray-900">
      <body className={`${inter.className} h-screen flex flex-col`}>
        <SetupChecker>
          {children}
        </SetupChecker>
      </body>
    </html>
  );
}