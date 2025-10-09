'use client';

import { FaCheckCircle, FaDownload } from 'react-icons/fa';
import { formatBRLNumber } from '@/app/utils/formatters';
import { format as formatDateFns } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';

export default function PixReceiptModal({ isOpen, onClose, receiptData }) {
    if (!isOpen || !receiptData) return null;

    const formatarDataTransacao = (date) => {
      return formatDateFns(date, "EEEE, dd/MM/yyyy", { locale: ptBR });
    };
    
    const handleDownload = () => {
        const doc = new jsPDF();
        
        // Título
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('Comprovante de PIX', 105, 20, { align: 'center' });

        // Valor
        doc.setFontSize(18);
        doc.text(formatBRLNumber(receiptData.valor), 105, 35, { align: 'center' });

        // Sobre a transação
        let y = 50;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Sobre a transação', 14, y);
        y += 7;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Data: ${formatarDataTransacao(receiptData.data)}`, 14, y);
        y += 7;
        doc.text(`Horário: ${formatDateFns(receiptData.data, "HH:mm")}`, 14, y);
        y += 7;
        doc.text(`ID da transação:`, 14, y);
        doc.setFont('courier', 'normal');
        doc.text(`${receiptData.transactionId}`, 14, y + 5);
        doc.setFont('helvetica', 'normal');
        y += 12;
        doc.text(`Mensagem: ${receiptData.descricao}`, 14, y);

        // Quem pagou
        y += 15;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Quem pagou', 14, y);
        y += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Nome: ${receiptData.pagador.nome}`, 14, y);
        y += 7;
        doc.text(`Conta: ${receiptData.pagador.conta}`, 14, y);

        doc.save(`comprovante_pix_${receiptData.transactionId.substring(0, 8)}.pdf`);
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