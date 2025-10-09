'use client';

import { FaCheckCircle, FaDownload } from 'react-icons/fa';
import { formatBRLNumber, formatCnpjCpf } from '@/app/utils/formatters';
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
        
        const loadImageAsBase64 = (url, callback) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataURL = canvas.toDataURL('image/png');
                callback(dataURL);
            };
            img.src = url;
        };

        loadImageAsBase64('/inter.png', (logoBase64) => {
            if (logoBase64) {
                doc.addImage(logoBase64, 'PNG', 95, 15, 20, 5);
            }

            doc.setFillColor(34, 197, 94);
            doc.circle(105, 30, 8, 'F');
            doc.setDrawColor(255, 255, 255);
            doc.setLineWidth(1.5);
            doc.line(102, 30, 104, 32);
            doc.line(104, 32, 108, 28);

            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(40, 40, 40);
            doc.text('Pix enviado', 105, 48, { align: 'center' });
            doc.setFontSize(26);
            doc.text(formatBRLNumber(receiptData.valor), 105, 58, { align: 'center' });

            let y = 75;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Sobre a transação', 14, y);
            y += 4;
            doc.setLineDashPattern([1, 1], 0);
            doc.line(14, y, 196, y);
            doc.setLineDashPattern([], 0);

            y += 8;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Data da transação`, 14, y);
            doc.text(formatarDataTransacao(receiptData.data), 196, y, { align: 'right' });
            y += 7;
            doc.text(`Horário`, 14, y);
            doc.text(formatDateFns(receiptData.data, "HH:mm"), 196, y, { align: 'right' });
            y += 7;
            doc.text(`ID da transação`, 14, y);
            doc.text(receiptData.transactionId, 196, y, { align: 'right' });
            y += 7;
            doc.text(`Mensagem ao recebedor`, 14, y);
            doc.text(receiptData.descricao, 196, y, { align: 'right' });

            y += 15;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Quem recebeu', 14, y);
            y += 4;
            doc.setLineDashPattern([1, 1], 0);
            doc.line(14, y, 196, y);
            doc.setLineDashPattern([], 0);
            y += 8;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Nome`, 14, y);
            doc.text(receiptData.recebedor.nome || '', 196, y, { align: 'right' });
            y += 7;
            doc.text(`Cpf/Cnpj`, 14, y);
            doc.text(formatCnpjCpf(receiptData.recebedor.cnpj || ''), 196, y, { align: 'right' });
            y += 7;
            doc.text(`Instituição`, 14, y);
            doc.text(receiptData.recebedor.instituicao || 'Não informado', 196, y, { align: 'right' });
            y += 7;
            doc.text(`Chave Pix`, 14, y);
            doc.text(receiptData.recebedor.chavePix || 'Não informado', 196, y, { align: 'right' });
            

            y += 15;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Quem pagou', 14, y);
            y += 4;
            doc.setLineDashPattern([1, 1], 0);
            doc.line(14, y, 196, y);
            doc.setLineDashPattern([], 0);
            y += 8;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Nome`, 14, y);
            doc.text(receiptData.pagador.nome || '', 196, y, { align: 'right' });
            y += 7;
            doc.text(`Instituição`, 14, y);
            doc.text(receiptData.pagador.conta || '', 196, y, { align: 'right' });

            // --- CORREÇÃO FINAL APLICADA AQUI ---
            doc.save(receiptData.filename || `comprovante_pix.pdf`);
        });
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
                    
                    {receiptData.recebedor && (
                         <div className="bg-gray-700 p-4 rounded-lg">
                            <h3 className="font-semibold text-gray-300 mb-2 border-b border-gray-600 pb-1">Quem recebeu</h3>
                             <div className="space-y-1">
                                <p><strong>Nome:</strong> {receiptData.recebedor.nome}</p>
                                <p><strong>Cpf/Cnpj:</strong> {formatCnpjCpf(receiptData.recebedor.cnpj)}</p>
                                <p><strong>Instituição:</strong> {receiptData.recebedor.instituicao || 'Não informado'}</p>
                                <p><strong>Chave Pix:</strong> {receiptData.recebedor.chavePix || 'Não informado'}</p>
                             </div>
                        </div>
                    )}
                    
                    <div className="bg-gray-800 p-4 rounded-lg">
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