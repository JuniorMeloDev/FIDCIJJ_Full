import { Inter } from "next/font/google";
import Navbar from "./components/Navbar";
//import SetupChecker from "./components/SetupChecker";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "FIDC IJJ",
  description: "Gestão de Desconto de Duplicatas",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-br">
      <body className={`${inter.className} h-screen overflow-hidden`}>
        <div className="bg-gray-900 h-full flex flex-col">
          {/* O SetupChecker envolve o conteúdo que depende do login/setup */}
           {/* <SetupChecker> */}
            <Navbar />
            <div className="flex-grow overflow-y-auto">
              {children}
            </div>
             {/* </SetupChecker> */}
        </div>
      </body>
    </html>
  );
}