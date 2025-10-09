'use client';

import { FaCheckCircle, FaDownload } from 'react-icons/fa';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';
import { format as formatDateFns } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function PixReceiptModal({ isOpen, onClose, receiptData }) {
    if (!isOpen || !receiptData) return null;

    const handleDownload = () => {
        alert('Funcionalidade de download do comprovante em PDF será implementada em breve.');
        // Aqui entrará a lógica com jsPDF para gerar o PDF
    };
    
    const formatarDataTransacao = (date) => {
      return formatDateFns(date, "EEEE, dd/MM/yyyy", { locale: ptBR });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[70]" onClick={onClose}>
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md text-white border-t-4 border-green-500" onClick={e => e.stopPropagation()}>
                <div className="text-center mb-6">
                    <FaCheckCircle className="text-green-500 text-5xl mx-auto mb-3" />
                    <h2 className="text-2xl font-bold">Pix enviado</h2>
                    <p className="text-3xl font-bold text-gray-100 mt-2">{formatBRLNumber(receiptData.valor)}</p>
                </div>

                <div className="space-y-4 text-sm">
                    <div className="bg-gray-700 p-4 rounded-lg">
                        <h3 className="font-semibold text-gray-300 mb-2 border-b border-gray-600 pb-1">Sobre a transação</h3>
                        <div className="space-y-1">
                            <p><strong>Data:</strong> {formatarDataTransacao(receiptData.data)}</p>
                            <p><strong>Horário:</strong> {formatDateFns(receiptData.data, "HH:mm")}</p>
                            <p className="break-all"><strong>ID da transação:</strong> {receiptData.transactionId}</p>
                            <p><strong>Mensagem:</strong> {receiptData.descricao}</p>
                        </div>
                    </div>
                    
                    <div className="bg-gray-700 p-4 rounded-lg">
                        <h3 className="font-semibold text-gray-300 mb-2 border-b border-gray-600 pb-1">Quem pagou</h3>
                         <div className="space-y-1">
                            <p><strong>Nome:</strong> {receiptData.pagador.nome}</p>
                            <p><strong>Conta:</strong> {receiptData.pagador.conta}</p>
                         </div>
                    </div>
                </div>

                <div className="mt-8 flex flex-col sm:flex-row justify-end gap-4">
                    <button onClick={onClose} className="bg-gray-600 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">
                        Fechar
                    </button>
                    <button onClick={handleDownload} className="bg-blue-600 font-semibold py-2 px-4 rounded-md hover:bg-blue-700 transition flex items-center justify-center gap-2">
                        <FaDownload /> Baixar Comprovante
                    </button>
                </div>
            </div>
        </div>
    );
}