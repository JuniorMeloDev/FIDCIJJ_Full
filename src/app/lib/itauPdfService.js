import { jsPDF } from 'jspdf';
import { format, differenceInDays, addDays } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';
import fs from 'fs';
import path from 'path';

// Função HELPER para obter a URL base
const getBaseURL = () => {
    // 1. Prioriza a URL de produção que você definiu
    let baseURL = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseURL && process.env.VERCEL_URL) {
        baseURL = `https://${process.env.VERCEL_URL}`;
    }
    if (!baseURL) {
        baseURL = 'http://localhost:3000';
    }
    return baseURL.replace(/\/$/, '');
};

// Função getItauLogoBase64 corrigida para ler do disco
const getItauLogoBase64 = async () => {
    const logoName = 'itau.png';
    console.log(`[LOG ITAÚ PDF] Tentando buscar logo do disco: ${logoName}`);

    try {
        const filePath = path.join(process.cwd(), 'public', logoName);
        console.log(`[LOG ITAÚ PDF] Caminho do arquivo: ${filePath}`);

        if (!fs.existsSync(filePath)) {
            console.error(`[ERRO ITAÚ PDF] Arquivo de logo não encontrado em: ${filePath}`);
            return null;
        }

        const imageBuffer = fs.readFileSync(filePath);
        console.log(`[LOG ITAÚ PDF] Arquivo lido. Tamanho: ${imageBuffer.byteLength} bytes`);

        const base64String = imageBuffer.toString('base64');
        return `data:image/png;base64,${base64String}`;
    } catch (error) {
        console.error("[ERRO ITAÚ PDF] Exceção durante leitura do logo do disco:", error);
        return null;
    }
};

// --- Funções de Cálculo de Dígito ---
function modulo10(bloco) {
    const multiplicadores = [2, 1];
    let soma = 0;
    for (let i = bloco.length - 1; i >= 0; i--) {
        let produto = parseInt(bloco[i], 10) * multiplicadores[(bloco.length - 1 - i) % 2];
        if (produto > 9) {
            produto = Math.floor(produto / 10) + (produto % 10);
        }
        soma += produto;
    }
    const resto = soma % 10;
    return resto === 0 ? 0 : 10 - resto;
}

function modulo11(bloco) {
    const multiplicadores = [2, 3, 4, 5, 6, 7, 8, 9];
    let soma = 0;
    for (let i = bloco.length - 1; i >= 0; i--) {
        soma += parseInt(bloco[i], 10) * multiplicadores[(bloco.length - 1 - i) % 8];
    }
    const resto = soma % 11;
    const dac = 11 - resto;
    return (dac === 0 || dac === 10 || dac === 11) ? 1 : dac;
}

const getAgenciaContaDAC = (agencia, conta) => modulo10(`${agencia}${conta}`);

export const getNossoNumeroDAC = (agencia, conta, carteira, nossoNumero) => {

    const sequencia = `${agencia}${conta}${carteira}${nossoNumero}`;
    
    return modulo10(sequencia);
};

// --- FUNÇÃO gerarLinhaDigitavelECodigoBarras COM VALIDAÇÃO E LOGS ---
function gerarLinhaDigitavelECodigoBarras(dados) {
    console.log("[LOG LINHA/BARRA] Iniciando geração com dados:", dados);
    try {
        const { agencia, conta, carteira, nossoNumero, valor, vencimento } = dados;

        // Validações de entrada
        if (typeof valor !== 'number' || isNaN(valor)) throw new Error(`Valor inválido: ${valor}`);
        if (!vencimento || isNaN(new Date(vencimento + 'T12:00:00Z'))) throw new Error(`Data de vencimento inválida: ${vencimento}`);
        if (!agencia || typeof agencia !== 'string') throw new Error(`Agência inválida: ${agencia}`);
        if (!conta || typeof conta !== 'string') throw new Error(`Conta inválida: ${conta}`);
        if (!carteira || typeof carteira !== 'string') throw new Error(`Carteira inválida: ${carteira}`);
        if (!nossoNumero || typeof nossoNumero !== 'string') throw new Error(`Nosso número inválido: ${nossoNumero}`);

        const banco = "341";
        const moeda = "9";
        const dataBase = new Date('1997-10-07T12:00:00Z');
        const dataVenc = new Date(vencimento + 'T12:00:00Z');
        console.log(`[LOG LINHA/BARRA] Data Vencimento: ${dataVenc}`);

        const diasCorridos = Math.ceil((dataVenc - dataBase) / (1000 * 60 * 60 * 24));
        if (isNaN(diasCorridos)) throw new Error("Falha ao calcular dias corridos.");
        console.log(`[LOG LINHA/BARRA] Dias Corridos: ${diasCorridos}`);

        let fatorVencimento;
        if (diasCorridos > 9999) {
            fatorVencimento = (diasCorridos - 9000).toString().padStart(4, '0');
        } else {
            fatorVencimento = diasCorridos.toString().padStart(4, '0');
        }
        console.log(`[LOG LINHA/BARRA] Fator Vencimento: ${fatorVencimento}`);

        const valorFormatado = Math.round(valor * 100).toString().padStart(10, '0');
        console.log(`[LOG LINHA/BARRA] Valor Formatado: ${valorFormatado}`);

        const nossoNumeroSemDac = nossoNumero.padStart(8, '0');
        const contaSemDac = (conta || '').split('-')[0].padStart(5, '0'); // Garante 5 dígitos
        const agenciaPad = agencia.padStart(4, '0');
        console.log(`[LOG LINHA/BARRA] Agencia: ${agenciaPad}, ContaSemDac: ${contaSemDac}, NossoNumeroSemDac: ${nossoNumeroSemDac}`);

        // AGORA ESTA FUNÇÃO USARÁ A LÓGICA CORRIGIDA
        const dacNossoNumero = getNossoNumeroDAC(agenciaPad, contaSemDac, carteira, nossoNumeroSemDac); 
        
        console.log(`[LOG LINHA/BARRA] DAC Nosso Numero (Corrigido): ${dacNossoNumero}`);
        const dacAgenciaConta = getAgenciaContaDAC(agenciaPad, contaSemDac);
        console.log(`[LOG LINHA/BARRA] DAC Agencia/Conta: ${dacAgenciaConta}`);

        const campoLivre = `${carteira}${nossoNumeroSemDac}${dacNossoNumero}${agenciaPad}${contaSemDac}${dacAgenciaConta}000`;
        console.log(`[LOG LINHA/BARRA] Campo Livre: ${campoLivre}`);
        if (campoLivre.length !== 25) throw new Error(`Campo livre gerado incorretamente (tamanho ${campoLivre.length}).`);

        const blocoParaDAC = `${banco}${moeda}${fatorVencimento}${valorFormatado}${campoLivre}`;
        console.log(`[LOG LINHA/BARRA] Bloco para DAC Geral: ${blocoParaDAC}`);
        const dacGeral = modulo11(blocoParaDAC);
        console.log(`[LOG LINHA/BARRA] DAC Geral: ${dacGeral}`);

        const codigoBarras = `${banco}${moeda}${dacGeral}${fatorVencimento}${valorFormatado}${campoLivre}`;
        console.log(`[LOG LINHA/BARRA] Código Barras: ${codigoBarras}`);
        if (codigoBarras.length !== 44) throw new Error(`Código de barras gerado incorretamente (tamanho ${codigoBarras.length}).`);

        const campo1 = `${banco}${moeda}${campoLivre.substring(0, 5)}`;
        const dv1 = modulo10(campo1);
        const campo2 = campoLivre.substring(5, 15);
        const dv2 = modulo10(campo2);
        const campo3 = campoLivre.substring(15, 25);
        const dv3 = modulo10(campo3);
        const campo4 = dacGeral;
        const campo5 = `${fatorVencimento}${valorFormatado}`;

        const linhaDigitavel =
            `${campo1.substring(0,5)}.${campo1.substring(5)}${dv1} ` +
            `${campo2.substring(0,5)}.${campo2.substring(5)}${dv2} ` +
            `${campo3.substring(0,5)}.${campo3.substring(5)}${dv3} ` +
            `${campo4}  ${campo5}`;
        console.log(`[LOG LINHA/BARRA] Linha Digitável: ${linhaDigitavel}`);

        console.log("[LOG LINHA/BARRA] Geração concluída com sucesso.");
        return { linhaDigitavel, codigoBarras };

    } catch (error) {
        console.error("[ERRO LINHA/BARRA] Falha ao gerar linha digitável/código de barras:", error);
        return undefined; // Retorna undefined para ser pego pela função chamadora
    }
}
// --- FIM DA FUNÇÃO gerarLinhaDigitavelECodigoBarras ---

// --- Funções de Desenho PDF ---
function drawInterleaved2of5(doc, x, y, code, width = 103, height = 13) {
    if (!code || !/^\d+$/.test(code)) return;
    const patterns = ['00110','10001','01001','11000','00101','10100','01100','00011','10010','01010'];
    const start = '0000', stop = '100';
    let binaryCode = start;
    if (code.length % 2 !== 0) code = '0' + code;
    for (let i = 0; i < code.length; i += 2) {
      const p1 = patterns[parseInt(code[i], 10)], p2 = patterns[parseInt(code[i+1], 10)];
      for (let j = 0; j < 5; j++) binaryCode += p1[j] + p2[j];
    }
    binaryCode += stop;
    const ratio = 3;
    const numNarrow = (binaryCode.match(/0/g) || []).length, numWide = (binaryCode.match(/1/g) || []).length;
    const narrowWidth = width / (numNarrow + numWide * ratio);
    let currentX = x;
    doc.setFillColor(0,0,0);
    for (let i = 0; i < binaryCode.length; i++) {
      const isBar = i % 2 === 0;
      const barWidth = binaryCode[i] === '1' ? narrowWidth * ratio : narrowWidth;
      if (isBar) doc.rect(currentX, y, barWidth, height, 'F');
      currentX += barWidth;
    }
}

const drawField = (doc, label, value, x, y, width, height, valueAlign = 'left', valueSize = 9, labelSize = 6.5) => {
     doc.setFontSize(labelSize).setTextColor(0,0,0);
    doc.text(label || '', x + 1, y + 2.5);
    doc.setFont('helvetica', 'normal').setFontSize(valueSize).setTextColor(0,0,0);
    const textX = valueAlign === 'right' ? x + width - 1 : (valueAlign === 'center' ? x + width / 2 : x + 1);
    const textY = label ? y + 6.5 : y + height / 2 + 1.5;
    const lines = (Array.isArray(value) ? value : [value]).filter(line => line !== null && line !== undefined && String(line).trim() !== '').map(line => String(line));
    if (lines.length > 0) {
        doc.text(lines, textX, textY, { align: valueAlign, lineHeightFactor: 1.15 });
    }
};
// --- FIM FUNÇÕES DE DESENHO ---

// --- Função Principal de Geração de PDF ---
export async function gerarPdfBoletoItau(listaBoletos) {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    console.log("[LOG ITAÚ PDF] Iniciando geração do PDF...");
    console.log("[LOG ITAÚ PDF] Buscando logo base64...");
    const itauLogoBase64 = await getItauLogoBase64();
    console.log(`[LOG ITAÚ PDF] Logo base64 obtido: ${itauLogoBase64 ? 'Sim' : 'Não'}`);

    listaBoletos.forEach((dadosBoleto, index) => {
        console.log(`[LOG ITAÚ PDF] Desenhando boleto índice ${index} (ID Duplicata: ${dadosBoleto.id})...`);
        try {
            if (index > 0) doc.addPage();

            const valorFinalBoleto = dadosBoleto.valor_bruto - (dadosBoleto.abatimento || 0);

            // --- PONTO CRÍTICO ---
            // Esta função agora usará a lógica de cálculo corrigida
            const linhaBarrasResult = gerarLinhaDigitavelECodigoBarras({
                agencia: dadosBoleto.agencia,
                conta: dadosBoleto.conta, // Conta COM dígito para ser tratada dentro da função
                carteira: dadosBoleto.carteira,
                nossoNumero: dadosBoleto.nosso_numero,
                valor: valorFinalBoleto,
                vencimento: dadosBoleto.data_vencimento
            });

            if (!linhaBarrasResult) {
                 console.error(`[ERRO ITAÚ PDF] Falha ao gerar linha/barras para boleto ${index} (ID Duplicata: ${dadosBoleto.id}). Pulando este boleto.`);
                 doc.setTextColor(255, 0, 0);
                 doc.text(`ERRO AO GERAR BOLETO ${index + 1} (ID ${dadosBoleto.id})`, 15, 15 + (index * 10));
                 doc.setTextColor(0, 0, 0);
                 return; // Pula para o próximo boleto
            }
            const { linhaDigitavel, codigoBarras } = linhaBarrasResult;
            // --- FIM DO PONTO CRÍTICO ---

            const vencimentoDate = new Date(dadosBoleto.data_vencimento + 'T12:00:00Z');
            
            // ATENÇÃO: dadosBoleto.dac_nosso_numero VEM DO BANCO DE DADOS.
            // Veja a "Ação Adicional" abaixo.
            const nossoNumeroImpresso = `${dadosBoleto.carteira}/${dadosBoleto.nosso_numero}-${dadosBoleto.dac_nosso_numero}`;

            const drawSection = (yOffset) => {
                doc.setLineWidth(0.2);
                if (itauLogoBase64) {
                   console.log(`[LOG ITAÚ PDF] Adicionando imagem para boleto ${index}`);
                   try {
                       doc.addImage(itauLogoBase64, 'PNG', 15, yOffset + 1, 30, 8);
                       console.log(`[LOG ITAÚ PDF] Imagem adicionada com sucesso para boleto ${index}`);
                   } catch (imgError) {
                       console.error(`[ERRO ITAÚ PDF] Erro ao adicionar imagem para boleto ${index}:`, imgError);
                   }
                } else {
                   console.warn(`[AVISO ITAÚ PDF] Logo não disponível para boleto ${index}.`);
                }

                doc.setLineWidth(0.5).line(48, yOffset, 48, yOffset + 10);
                doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(0, 0, 0);
                doc.text('341-7', 55.5, yOffset + 7, { align: 'center' });
                doc.setLineWidth(0.5).line(63, yOffset, 63, yOffset + 10);
                doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0, 0, 0);
                doc.text(linhaDigitavel, 65, yOffset + 7, { charSpace: 0.5 });
                doc.setFont('helvetica', 'bold');

                const y1 = yOffset + 10;
                drawField(doc, 'Local de pagamento', 'Pague pelo aplicativo, internet ou em agências e correspondentes.', 15, y1, 140, 10, 'left', 8);
                drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), 155, y1, 40, 10, 'right', 9);

                const y2 = y1 + 10;
                const beneficiarioLine1 = `${dadosBoleto.cedente?.nome || ''}    CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente?.cnpj)}`;
                const beneficiarioLine2 = dadosBoleto.cedente?.endereco;
                drawField(doc, 'Beneficiário', [beneficiarioLine1, beneficiarioLine2], 15, y2, 140, 15, 'left', 8);
                drawField(doc, 'Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 155, y2, 40, 15, 'right');

                const y3 = y2 + 15;
                drawField(doc, 'Data do documento', format(new Date(dadosBoleto.data_operacao + 'T12:00:00Z'), 'dd/MM/yyyy'), 15, y3, 30, 10, 'left', 8);

                // --- ALTERAÇÃO AQUI ---
                // Usa nf_cte (Seu Número) no campo "Núm. do documento" visualmente
                drawField(doc, 'Núm. do documento', dadosBoleto.nf_cte || '', 45, y3, 30, 10, 'left', 8);
                // --- FIM DA ALTERAÇÃO ---

                drawField(doc, 'Espécie Doc.', 'DM', 75, y3, 20, 10, 'left', 8);
                drawField(doc, 'Aceite', 'N', 95, y3, 15, 10, 'left', 8);
                drawField(doc, 'Data Processamento', format(new Date(), 'dd/MM/yyyy'), 110, y3, 45, 10, 'left', 8);
                drawField(doc, 'Nosso Número', nossoNumeroImpresso, 155, y3, 40, 10, 'right');

                const y4 = y3 + 10;
                drawField(doc, 'Uso do Banco', '', 15, y4, 25, 10);
                drawField(doc, 'Carteira', dadosBoleto.carteira, 40, y4, 15, 10, 'center');
                drawField(doc, 'Espécie', 'R$', 55, y4, 15, 10, 'center');
                drawField(doc, 'Quantidade', '', 70, y4, 30, 10);
                drawField(doc, 'Valor', '', 100, y4, 55, 10);
                drawField(doc, '(=) Valor do Documento', formatBRLNumber(valorFinalBoleto), 155, y4, 40, 10, 'right', 9);

                const y5 = y4 + 10;
                const tipoOp = dadosBoleto.operacao?.tipo_operacao;
                const jurosText = tipoOp?.taxa_juros_mora > 0 ? `APÓS 1 DIA(S) CORRIDO(S) DO VENCIMENTO COBRAR JUROS DE ${tipoOp.taxa_juros_mora.toFixed(2).replace('.',',')}% AO MÊS` : null;
                const multaText = tipoOp?.taxa_multa > 0 ? `APÓS 1 DIA(S) CORRIDO(S) DO VENCIMENTO COBRAR MULTA DE ${tipoOp.taxa_multa.toFixed(2).replace('.',',')}%` : null;
                const abatimentoText = (dadosBoleto.abatimento && dadosBoleto.abatimento > 0) ? `CONCEDER ABATIMENTO DE ${formatBRLNumber(dadosBoleto.abatimento)}` : null;
                const instrucoes = [
                    'Instruções de responsabilidade do BENEFICIÁRIO. Qualquer dúvida sobre este boleto contate o BENEFICIÁRIO.', '',
                    jurosText, multaText, (jurosText || multaText) ? '' : null,
                    'PROTESTAR APÓS 5 DIAS DO VENCIMENTO', abatimentoText ? '' : null, abatimentoText, abatimentoText ? '' : null,
                    `REFERENTE A NF ${ (dadosBoleto.nf_cte || '').split('.')[0] }`
                ];
                doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(0,0,0);
                doc.text(instrucoes.filter(item => item !== null), 16, y5 + 3, { lineHeightFactor: 1.15, maxWidth: 135 });
                drawField(doc, '(-) Descontos/Abatimento', '', 155, y5, 40, 10);
                drawField(doc, '(+) Juros/Multa', '', 155, y5 + 10, 40, 10);
                drawField(doc, '(=) Valor Cobrado', '', 155, y5 + 20, 40, 10);

                const y6 = y5 + 30;
                const sacado = dadosBoleto.sacado || {};
                const pagadorLine1 = `${sacado.nome || ''}    CNPJ/CPF: ${formatCnpjCpf(sacado.cnpj)}`;
                const pagadorLine2 = `${sacado.endereco || ''}, ${sacado.bairro || ''}`;
                const pagadorLine3 = `${sacado.cep || ''} ${sacado.municipio || ''} - ${sacado.uf || ''}`;
                drawField(doc, 'Pagador', null, 15, y6, 180, 20);
                doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(0,0,0);
                doc.text([pagadorLine1, pagadorLine2, pagadorLine3], 16, y6 + 5, { lineHeightFactor: 1.15 });

                const y7 = y6 + 20;
                drawInterleaved2of5(doc, 15, y7 + 2, codigoBarras, 103, 13);
                doc.setFontSize(8).text('Autenticação mecânica', 195, y7 + 18, {align: 'right'});

                doc.setLineWidth(0.2);
                const allY = [yOffset, y1, y2, y3, y4, y5, y6, y7];
                allY.forEach(yPos => doc.line(15, yPos, 195, yPos));
                doc.line(15, yOffset, 15, y7); doc.line(195, yOffset, 195, y7); doc.line(155, y1, 155, y6);
                doc.line(45, y3, 45, y4); doc.line(75, y3, 75, y4); doc.line(95, y3, 95, y4); doc.line(110, y3, 110, y4);
                doc.line(40, y4, 40, y5); doc.line(55, y4, 55, y5); doc.line(70, y4, 70, y5); doc.line(100, y4, 100, y5);
                doc.line(155, y5 + 10, 195, y5 + 10); doc.line(155, y5 + 20, 195, y5 + 20);
            }; // Fim da drawSection

            console.log(`[LOG ITAÚ PDF] Chamando drawSection para RECIBO (index ${index})`);
            drawSection(15);
            doc.setFont('helvetica', 'bold').setFontSize(9).text('RECIBO DO PAGADOR', 15, 12);
            doc.setLineDashPattern([2, 1], 0).line(15, 148, 195, 148).setLineDashPattern([], 0);

            console.log(`[LOG ITAÚ PDF] Chamando drawSection para FICHA (index ${index})`);
            drawSection(155);
            doc.setFont('helvetica', 'bold').setFontSize(9).text('Ficha de Compensação', 15, 152);

            doc.setFontSize(6).setTextColor(100,100,100);
            const footerText = 'Em caso de dúvidas, de posse do comprovante, contate seu gerente ou a Central no 4004 1685 (capitais e regiões metropolitanas) ou 0800 770 1685 (demais localidades). Reclamações, informações e cancelamentos: SAC 0800 728 0728, 24 horas por dia. Fale Conosco: www.itau.com.br/empresas. Se não ficar satisfeito com a solução, contate a Ouvidoria: 0800 570 0011, em dias úteis, das 9h às 18h. Deficiente auditivo/fala: 0800 722 1722.';
            doc.text(footerText, 15, 288, { maxWidth: 180, align: 'justify' });
            console.log(`[LOG ITAÚ PDF] Desenho do boleto índice ${index} concluído.`);

        } catch (boletoError) {
            console.error(`[ERRO ITAÚ PDF] Erro ao processar boleto ${index} (ID Duplicata: ${dadosBoleto?.id}):`, boletoError);
             if (index > 0) doc.addPage();
             doc.setTextColor(255, 0, 0);
             doc.text(`ERRO AO GERAR BOLETO ${index + 1} (ID ${dadosBoleto?.id}): ${boletoError.message}`, 10, 15, { maxWidth: 180 });
             doc.setTextColor(0, 0, 0);
        }
    }); // Fim do forEach

    console.log("[LOG ITAÚ PDF] Geração de todos os boletos concluída. Gerando buffer de saída...");
    try {
        const outputBuffer = doc.output('arraybuffer');
        console.log(`[LOG ITAÚ PDF] Buffer de saída gerado, tamanho: ${outputBuffer.byteLength} bytes`);
        if (outputBuffer.byteLength < 100) {
            console.error("[ERRO ITAÚ PDF] Buffer gerado parece inválido (muito pequeno).");
            throw new Error("Geração do PDF resultou em um arquivo inválido.");
        }
        return outputBuffer;
    } catch (outputError) {
        console.error("[ERRO ITAÚ PDF] Erro ao gerar o buffer de saída do PDF:", outputError);
        throw outputError;
    }
}