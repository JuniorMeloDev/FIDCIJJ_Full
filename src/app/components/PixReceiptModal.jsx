'use client';

import { useMemo } from 'react';
import { FaDownload } from 'react-icons/fa';
import { formatBRLNumber, formatCnpjCpf } from '@/app/utils/formatters';
import { format as formatDateFns } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';

export default function PixReceiptModal({ isOpen, onClose, receiptData }) {
  const pagadorInfo = useMemo(() => {
    if (!isOpen || !receiptData) return null;

    const payerAccountString = receiptData.pagador.conta || '';
    const isInter = payerAccountString.toLowerCase().includes('inter');

    if (isInter) {
      return {
        nome: process.env.NEXT_PUBLIC_INTER_EMITENTE_NOME || receiptData.pagador.nome,
        cnpj: process.env.NEXT_PUBLIC_INTER_EMITENTE_CNPJ || receiptData.pagador.cnpj,
        conta: receiptData.pagador.conta
      };
    }

    return receiptData.pagador;
  }, [isOpen, receiptData]);

  if (!isOpen || !receiptData) return null;

  const formatarDataTransacao = (date) => {
    const dataObj = typeof date === 'string' ? new Date(date) : date;
    if (!dataObj || !(dataObj instanceof Date) || isNaN(dataObj)) {
      return 'Data inválida';
    }
    return formatDateFns(dataObj, 'EEEE, dd/MM/yyyy', { locale: ptBR });
  };

  const handleDownload = () => {
    const doc = new jsPDF();

    const payerAccountString = pagadorInfo.conta || '';
    const payerStringLower = payerAccountString.toLowerCase();
    const isItau = payerStringLower.includes('itaú') || payerStringLower.includes('itau');
    const logoPath = isItau ? '/ItauEmpresas.png' : '/inter.png';

    const loadImageAsBase64 = (url, callback) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        callback(canvas.toDataURL('image/png'), img.width, img.height);
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

      const dataObj = typeof receiptData.data === 'string' ? new Date(receiptData.data) : receiptData.data;
      const dataFormatada = dataObj
        ? formatDateFns(dataObj, 'dd MMM. yyyy, HH:mm:ss', { locale: ptBR })
        : 'Data inválida';
      doc.text(`${dataFormatada}, via API`, 14, y);

      y += 7;
      doc.setLineDashPattern([1, 1], 0);
      doc.line(14, y, 196, y);
      doc.setLineDashPattern([], 0);

      y += 7;
      doc.setTextColor(100, 100, 100);
      doc.text('Tipo de transferência', 14, y);
      doc.setTextColor(40, 40, 40);
      doc.setFont('helvetica', 'bold');
      doc.text('Pix', 196, y, { align: 'right' });

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

      y += 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text('de', 14, y);
      y += 5;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text(pagadorInfo.nome || 'Não informado', 14, y);
      y += 5;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(pagadorInfo.conta || 'Conta não informada', 14, y);
      y += 5;
      doc.text(`CPF/CNPJ - ${pagadorInfo.cnpj ? formatCnpjCpf(pagadorInfo.cnpj) : 'Não informado'}`, 14, y);

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

      const desc = receiptData.descricao || 'Comprovante PIX';
      const valor = receiptData.valor || 0;
      const valorFormatado = formatBRLNumber(valor);
      const cleanDesc = desc.replace(/[/\\]/g, '-').replace(/[:*?"<>|]/g, '');
      const finalFilename = `${cleanDesc} - ${valorFormatado}.pdf`;

      doc.save(finalFilename);
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border-t-4 border-green-500 bg-gray-800 text-white shadow-2xl sm:max-w-sm sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-700 px-5 py-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold">Pagamento Enviado</h2>
            <p className="mt-2 text-3xl font-bold text-gray-100">{formatBRLNumber(receiptData.valor)}</p>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm sm:px-6">
          <div className="rounded-lg bg-gray-700 p-4">
            <h3 className="mb-2 border-b border-gray-600 pb-1 font-semibold text-gray-300">Sobre a transação</h3>
            <div className="space-y-1">
              <p><strong>Data:</strong> {formatarDataTransacao(receiptData.data)}</p>
              <p><strong>Horário:</strong> {receiptData.data ? formatDateFns(new Date(receiptData.data), 'HH:mm:ss') : '00:00'}</p>
              <p className="break-all"><strong>ID da transação:</strong> {receiptData.transactionId}</p>
              <p><strong>Mensagem:</strong> {receiptData.descricao}</p>
            </div>
          </div>

          {receiptData.recebedor && (
            <div className="rounded-lg bg-gray-700 p-4">
              <h3 className="mb-2 border-b border-gray-600 pb-1 font-semibold text-gray-300">Quem recebeu</h3>
              <div className="space-y-1">
                <p><strong>Nome:</strong> {receiptData.recebedor?.nome || 'Não informado'}</p>
                <p><strong>Cpf/Cnpj:</strong> {receiptData.recebedor?.cnpj ? formatCnpjCpf(receiptData.recebedor.cnpj) : 'Não informado'}</p>
                <p><strong>Instituição:</strong> {receiptData.recebedor?.instituicao || 'Não informado'}</p>
                <p><strong>Chave Pix:</strong> {receiptData.recebedor?.chavePix || 'Não informado'}</p>
              </div>
            </div>
          )}

          {pagadorInfo && (
            <div className="rounded-lg bg-gray-700 p-4">
              <h3 className="mb-2 border-b border-gray-600 pb-1 font-semibold text-gray-300">Quem pagou</h3>
              <div className="space-y-1">
                <p><strong>CPF/CNPJ:</strong> {pagadorInfo.cnpj ? formatCnpjCpf(pagadorInfo.cnpj) : 'Não informado'}</p>
                <p><strong>Nome:</strong> {pagadorInfo.nome}</p>
                <p><strong>Conta:</strong> {pagadorInfo.conta}</p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-700 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button onClick={onClose} className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold transition hover:bg-gray-500 sm:w-auto">
              Fechar
            </button>
            <button onClick={handleDownload} className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-700 sm:w-auto">
              <FaDownload /> Baixar Comprovante
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
