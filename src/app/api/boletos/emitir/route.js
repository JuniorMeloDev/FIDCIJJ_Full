import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { format } from 'date-fns';

// Serviços dos bancos
import { getSafraAccessToken, registrarBoletoSafra, consultarBoletoSafra } from '@/app/lib/safraService';
import { getBradescoAccessToken, registrarBoleto } from '@/app/lib/bradescoService';

// --- Funções Auxiliares para Preparar os Dados ---
async function getDadosParaBoleto(duplicataId, banco) {
    const { data: duplicata, error: dupError } = await supabase
        .from('duplicatas')
        .select('*')
        .eq('id', duplicataId)
        .single();
    if (dupError || !duplicata) throw new Error(`Duplicata com ID ${duplicataId} não encontrada.`);

    let sacado;
    // LÓGICA DE FALLBACK: Tenta pelo ID primeiro, depois pelo nome.
    if (duplicata.sacado_id) {
        const { data: sacadoPorId } = await supabase.from('sacados').select('*').eq('id', duplicata.sacado_id).single();
        sacado = sacadoPorId;
    } else {
        const { data: sacadoPorNome } = await supabase.from('sacados').select('*').eq('nome', duplicata.cliente_sacado).single();
        sacado = sacadoPorNome;
    }
    
    if (!sacado) throw new Error(`Sacado "${duplicata.cliente_sacado}" não encontrado.`);

    if (banco === 'safra') {
        const idPart = duplicata.id.toString().slice(-4).padStart(4, '0');
        const randomPart = Math.floor(10000 + Math.random() * 90000).toString().slice(0, 5);
        const nossoNumeroUnico = `${idPart}${randomPart}`;

        return {
            agencia: "12400",
            conta: "008554440",
            documento: {
                numero: nossoNumeroUnico,
                numeroCliente: duplicata.nf_cte.substring(0, 10),
                especie: "02",
                dataVencimento: format(new Date(duplicata.data_vencimento + 'T12:00:00Z'), 'yyyy-MM-dd'),
                valor: parseFloat(duplicata.valor_bruto.toFixed(2)),
                pagador: {
                    nome: sacado.nome.substring(0, 40),
                    tipoPessoa: (sacado.cnpj || '').length > 11 ? "J" : "F",
                    numeroDocumento: (sacado.cnpj || '').replace(/\D/g, ''),
                    endereco: {
                        logradouro: (sacado.endereco || 'NAO INFORMADO').substring(0, 40),
                        bairro: (sacado.bairro || 'NAO INFORMADO').substring(0, 10),
                        cidade: (sacado.municipio || 'NAO INFORMADO').substring(0, 15),
                        uf: sacado.uf || 'SP',
                        cep: (sacado.cep || '00000000').replace(/\D/g, ''),
                    }
                }
            }
        };
    } else if (banco === 'bradesco') {
         return {
            "filialCPFCNPJ": process.env.BRADESCO_FILIAL_CNPJ,
            "ctrlCPFCNPJ": process.env.BRADESCO_CTRL_CNPJ,
            "codigoUsuarioSolicitante": process.env.BRADESCO_CODIGO_USUARIO,
            "nuCPFCNPJ": process.env.BRADESCO_CPFCNPJ_RAIZ,
            "registraTitulo": {
                "idProduto": "9",
                "nuNegociacao": process.env.BRADESCO_NU_NEGOCIACAO,
                "nossoNumero": duplicata.id.toString().padStart(11, '0'),
                "dtEmissaoTitulo": new Date(duplicata.data_operacao + 'T12:00:00Z').toISOString().slice(0, 10).replace(/-/g, ''),
                "dtVencimentoTitulo": new Date(duplicata.data_vencimento + 'T12:00:00Z').toISOString().slice(0, 10).replace(/-/g, ''),
                "valorNominalTitulo": Math.round(duplicata.valor_bruto * 100),
                "pagador": {
                    "nuCPFCNPJ": (sacado.cnpj || '').replace(/\D/g, ''),
                    "nome": sacado.nome.substring(0, 40),
                    "logradouro": (sacado.endereco || 'NAO INFORMADO').substring(0, 40),
                    "nuLogradouro": "0",
                    "bairro": (sacado.bairro || 'NAO INFORMADO').substring(0, 15),
                    "cep": (sacado.cep || '00000000').replace(/\D/g, ''),
                    "cidade": (sacado.municipio || 'NAO INFORMADO').substring(0, 15),
                    "uf": sacado.uf || 'PE',
                },
                "especieTitulo": "DM",
                "percentualJuros": "0", "valorJuros": "0", "qtdeDiasJuros": "0",
                "percentualMulta": "0", "valorMulta": "0", "qtdeDiasMulta": "0"
            }
        };
    }
    
    throw new Error("Banco inválido.");
}

// --- ROTA PRINCIPAL ---
export async function POST(request) {
    let tokenData;
    let dadosParaBoleto;

    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { duplicataId, banco } = await request.json();

        dadosParaBoleto = await getDadosParaBoleto(duplicataId, banco);

        let boletoGerado;
        let linhaDigitavel;

        if (banco === 'safra') {
            tokenData = await getSafraAccessToken();
            try {
                boletoGerado = await registrarBoletoSafra(tokenData.access_token, dadosParaBoleto);
            } catch (error) {
                // SE O ERRO FOR "JÁ REGISTRADO", TENTA CONSULTAR
                if (error.message && error.message.includes('DUPLICADOS')) {
                    console.log(`Boleto já registrado para ${dadosParaBoleto.documento.numero}. Tentando consultar...`);
                    const consultaParams = {
                        agencia: dadosParaBoleto.agencia,
                        conta: dadosParaBoleto.conta,
                        nossoNumero: dadosParaBoleto.documento.numero,
                        numeroCliente: dadosParaBoleto.documento.numeroCliente,
                    };
                    boletoGerado = await consultarBoletoSafra(tokenData.access_token, consultaParams);
                } else {
                    throw error; // Se for outro erro, propaga
                }
            }
            linhaDigitavel = boletoGerado.data?.documento?.codigoBarras || boletoGerado.data?.codigoBarras || 'N/A';
        
        } else if (banco === 'bradesco') {
            tokenData = await getBradescoAccessToken();
            boletoGerado = await registrarBoleto(tokenData.access_token, dadosParaBoleto);
            linhaDigitavel = boletoGerado.linhaDigitavel || 'N/A';
        
        } else {
            throw new Error("Banco selecionado inválido.");
        }
        
        // Atualiza a duplicata no nosso banco de dados
        const { error: updateError } = await supabase
            .from('duplicatas')
            .update({ 
                linha_digitavel: linhaDigitavel,
                banco_emissor_boleto: banco 
            })
            .eq('id', duplicataId);

        if (updateError) {
            console.error("Erro ao salvar linha digitável no DB:", updateError);
            return NextResponse.json({ success: true, linhaDigitavel, warning: "Boleto emitido, mas falha ao salvar no banco de dados local." });
        }

        return NextResponse.json({ success: true, linhaDigitavel });

    } catch (error) {
        console.error(`Erro na API de emissão de boleto: ${error.message}`);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}