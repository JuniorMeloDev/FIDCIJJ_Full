"use client";

import { motion } from "framer-motion";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Bem-vindo + História */}
      <section className="flex flex-1 flex-col items-center justify-center text-center p-10 space-y-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-orange-400">
            Bem-vindo à FIDC IJJ
          </h2>
          <p className="text-lg md:text-xl max-w-2xl mx-auto text-gray-300">
            Somos uma FIDC moderna e tecnológica, focada em impulsionar seu
            capital com inteligência, segurança e inovação.
          </p>
        </motion.div>

        <motion.div
          className="max-w-2xl text-left space-y-4 text-gray-300"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
        >
          <h3 className="text-2xl font-semibold text-white">Nossa História</h3>
          <p className="text-justify text-gray-300 max-w-2xl mx-auto">
            A FIDC IJJ nasceu em 2023 com o propósito de oferecer soluções de
            crédito estruturado para pequenas e médias empresas. Ao longo dos
            anos, fortalecemos nossa expertise em gestão de ativos e crédito,
            sempre pautados pela transparência e excelência operacional.
          </p>
        </motion.div>

        <motion.a
          href="/login"
          className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-md shadow-lg transition transform hover:scale-105"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.6 }}
        >
          Fazer Login
        </motion.a>
      </section>
    </main>
  );
}
