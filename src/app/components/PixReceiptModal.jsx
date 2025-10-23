'use client';

import { FaDownload } from 'react-icons/fa';
import { formatBRLNumber, formatCnpjCpf } from '@/app/utils/formatters';
import { format as formatDateFns } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';

export default function PixReceiptModal({ isOpen, onClose, receiptData }) {
    if (!isOpen || !receiptData) return null;

    const formatarDataTransacao = (date) => {
      if (!date || !(date instanceof Date) || isNaN(date)) {
        return "Data inválida";
      }
      return formatDateFns(date, "EEEE, dd/MM/yyyy", { locale: ptBR });
    };

    const handleDownload = () => {
        const doc = new jsPDF();

        const payerAccountString = receiptData.pagador.conta || '';
        const payerStringLower = payerAccountString.toLowerCase();
        
        const logoPath = (payerStringLower.includes('itaú') || payerStringLower.includes('itau')) 
            ? '/ItauEmpresas.png' 
            : '/inter.png';

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
                callback(dataURL, img.width, img.height);
            };
            img.onerror = () => {
                console.error(`Erro ao carregar imagem: ${url}`);
                callback(null, 0, 0);
            };
            img.src = url;
        };

        loadImageAsBase64(logoPath, (logoBase64, imgWidth, imgHeight) => {
            if (logoBase64 && logoPath === '/ItauEmpresas.png') {
                const pdfWidth = 25; 
                const pdfHeight = (imgHeight * pdfWidth) / imgWidth; 
                doc.addImage(logoBase64, 'PNG', 14, 15, pdfWidth, pdfHeight); 
            } else if (logoBase64) {
                 const pdfWidth = 20;
                 const pdfHeight = (imgHeight * pdfWidth) / imgWidth;
                doc.addImage(logoBase64, 'PNG', 95, 15, pdfWidth, pdfHeight); 
            }

            let y = 40; 
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100); 

            const dataFormatada = receiptData.data 
                ? formatDateFns(receiptData.data, "dd MMM. yyyy, HH:mm:ss", { locale: ptBR }) 
                : "Data inválida";
            doc.text(`${dataFormatada}, via API`, 14, y);

            y += 7;
            doc.setLineDashPattern([1, 1], 0);
            doc.line(14, y, 196, y);
            doc.setLineDashPattern([], 0);

            // Tipo de transferência
            y += 7;
            doc.setTextColor(100, 100, 100);
            doc.text('Tipo de transferência', 14, y);
            doc.setTextColor(40, 40, 40);
            doc.setFont('helvetica', 'bold');
            doc.text('Pix', 196, y, { align: 'right' });

            // Valor
            y += 7;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text('Valor da transferência', 14, y);
            doc.setTextColor(40, 40, 40);
            doc.setFont('helvetica', 'bold');
            doc.text(formatBRLNumber(receiptData.valor), 196, y, { align: 'right' });
            y += 7;
            doc.setLineDashPattern([1, 1], 0);
            doc.line(14, y, 196, y);
            doc.setLineDashPattern([], 0);

            // Pagador ("de")
            y += 10;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text('de', 14, y);
            y += 5;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(40, 40, 40);
            doc.text(receiptData.pagador.nome || 'Não informado', 14, y);
            y += 5;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(receiptData.pagador.conta || 'Conta não informada', 14, y);
            y += 5;
            doc.text(`CPF/CNPJ - ${receiptData.pagador.cnpj ? formatCnpjCpf(receiptData.pagador.cnpj) : 'Não informado'}`, 14, y);

            // Recebedor ("para")
            y += 10;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text('para', 14, y);
            y += 5;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(40, 40, 40);
            doc.text(receiptData.recebedor?.nome || 'Não informado', 14, y);
            y += 5;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(receiptData.recebedor?.instituicao || 'Instituição não informada', 14, y);
            y += 5;
            
            let docRecebedorFormatado = 'Não informado';
            if (receiptData.recebedor?.cnpj) {
                 docRecebedorFormatado = formatCnpjCpf(receiptData.recebedor.cnpj);
                 if (docRecebedorFormatado.length <= 14) { 
                    docRecebedorFormatado = `***.${docRecebedorFormatado.substring(4, 7)}.${docRecebedorFormatado.substring(8, 11)}-**`;
                 }
            }
            
            doc.text(`CPF/CNPJ - ${docRecebedorFormatado}`, 14, y);
            y += 5;
            doc.text(`Chave - ${receiptData.recebedor?.chavePix || 'Não informada'}`, 14, y);

            // Identificação no comprovante (Mensagem)
            y += 10;
            doc.setLineDashPattern([1, 1], 0);
            doc.line(14, y, 196, y);
            doc.setLineDashPattern([], 0);
            y += 7;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text('Identificação no comprovante', 14, y);
            doc.setTextColor(40, 40, 40);
            doc.setFont('helvetica', 'bold');
            doc.text(receiptData.descricao, 196, y, { align: 'right' });

            // ID da transação
            y += 7;
            doc.setLineDashPattern([1, 1], 0);
            doc.line(14, y, 196, y);
            doc.setLineDashPattern([], 0);
            y += 7;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text('ID da transação', 14, y);
            doc.setTextColor(40, 40, 40);
            doc.setFont('helvetica', 'bold');
            doc.text(receiptData.transactionId, 196, y, { align: 'right' });

            // --- INÍCIO DA MODIFICAÇÃO DO NOME DO ARQUIVO ---
            // 1. Pega os dados do recibo
            const desc = receiptData.descricao || 'Comprovante PIX';
            const valor = receiptData.valor || 0;
            
            // 2. Formata o valor
            const valorFormatado = formatBRLNumber(valor); // Ex: "R$ 5,00"
            
            // 3. Limpa a descrição (remove caracteres inválidos para nome de arquivo)
            const cleanDesc = desc.replace(/[/\\]/g, '-').replace(/[:*?"<>|]/g, '');
            
            // 4. Cria o nome final do arquivo
            const finalFilename = `${cleanDesc} - ${valorFormatado}.pdf`;
            // --- FIM DA MODIFICAÇÃO ---
            
            // 5. Salva o PDF com o nome dinâmico
            doc.save(finalFilename);
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[70]" onClick={onClose}>
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-sm text-white border-t-4 border-green-500 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                
                <div className="text-center mb-6 flex-shrink-0">
                    <h2 className="text-2xl font-bold mt-3">Pagamento Enviado</h2>
                    <p className="text-3xl font-bold text-gray-100 mt-2">{formatBRLNumber(receiptData.valor)}</p>
                </div>

                <div className="space-y-4 text-sm overflow-y-auto pr-2">
                    <div className="bg-gray-700 p-4 rounded-lg">
                        <h3 className="font-semibold text-gray-300 mb-2 border-b border-gray-600 pb-1">Sobre a transação</h3>
                        <div className="space-y-1">
                            <p><strong>Data:</strong> {formatarDataTransacao(receiptData.data)}</p>
                            <p><strong>Horário:</strong> {receiptData.data ? formatDateFns(receiptData.data, "HH:mm") : '00:00'}</p>
                            <p className="break-all"><strong>ID da transação:</strong> {receiptData.transactionId}</p>
                            <p><strong>Mensagem:</strong> {receiptData.descricao}</p>
                        </div>
                    </div>

                    {receiptData.recebedor && (
                         <div className="bg-gray-700 p-4 rounded-lg">
                            <h3 className="font-semibold text-gray-300 mb-2 border-b border-gray-600 pb-1">Quem recebeu</h3>
                             <div className="space-y-1">
                                <p><strong>Nome:</strong> {receiptData.recebedor?.nome || 'Não informado'}</p>
                                <p><strong>Cpf/Cnpj:</strong> {receiptData.recebedor?.cnpj ? formatCnpjCpf(receiptData.recebedor.cnpj) : 'Não informado'}</p>
                                <p><strong>Instituição:</strong> {receiptData.recebedor?.instituicao || 'Não informado'}</p>
                                <p><strong>Chave Pix:</strong> {receiptData.recebedor?.chavePix || 'Não informado'}</p>
                             </div>
                        </div>
                    )}

                    <div className="bg-gray-700 p-4 rounded-lg">
                        <h3 className="font-semibold text-gray-300 mb-2 border-b border-gray-600 pb-1">Quem pagou</h3>
                         <div className="space-y-1">
                            <p><strong>CPF/CNPJ:</strong> {receiptData.pagador.cnpj ? formatCnpjCpf(receiptData.pagador.cnpj) : 'Não informado'}</p>
                            <p><strong>Nome:</strong> {receiptData.pagador.nome}</p>
                            <p><strong>Conta:</strong> {receiptData.pagador.conta}</p>
                         </div>
                    </div>
                </div>

                <div className="mt-8 flex flex-col sm:flex-row justify-end gap-4 flex-shrink-0">
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