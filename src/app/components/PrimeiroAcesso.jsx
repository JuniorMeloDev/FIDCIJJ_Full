'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { FaChartLine } from 'react-icons/fa';

export default function PrimeiroAcesso() {
    const router = useRouter();

    const handleCadastroClick = () => {
        router.push('/cadastros/clientes'); 
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-6">
            <motion.div 
                className="p-10 bg-gray-800 rounded-lg shadow-xl text-center max-w-lg mx-4"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
            >
                <div className="flex items-center justify-center mb-6 space-x-2">
                    <FaChartLine className="w-8 h-8 text-orange-400" />
                    <span className="text-2xl font-bold text-white">IJJ FIDC</span>
                </div>
                
                <h1 className="text-3xl font-bold text-orange-400 mb-4">Bem-vindo(a)!</h1>
                
                <p className="text-gray-300 mb-6">
                 Para começar a usar o sistema, o primeiro passo é cadastrar a sua empresa, pelo menos uma conta bancária associada a ela e o tipo de operação.
                </p>
                <p className="text-gray-300 mb-8">
                    Clique no botão abaixo para ser direcionado à tela de cadastros.
                </p>
                
                <motion.button
                    onClick={handleCadastroClick}
                    className="bg-orange-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-orange-600 transition-colors duration-300 transform hover:scale-105"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    Iniciar Cadastro
                </motion.button>
            </motion.div>
        </div>
    );
}