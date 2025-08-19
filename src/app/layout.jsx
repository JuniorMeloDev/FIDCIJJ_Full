import { Inter } from "next/font/google";
import Navbar from "./components/Navbar";
import SetupChecker from "./components/SetupChecker";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "FIDC IJJ",
  description: "Gestão de Desconto de Duplicatas",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-br" className="bg-gray-900 h-full">
      <body className={`${inter.className} h-full flex flex-col`}>
        <SetupChecker>
          <Navbar />
          <div className="flex-grow pt-16 flex flex-col overflow-hidden">
            {children}
          </div>
        </SetupChecker>
      </body>
    </html>
  );
}