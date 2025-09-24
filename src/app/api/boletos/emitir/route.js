import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { format } from 'date-fns';

// Serviços dos bancos
import { getSafraAccessToken, registrarBoletoSafra, consultarBoletoSafra } from '@/app/lib/safraService';
import { getBradescoAccessToken, registrarBoleto } from '@/app/lib/bradescoService';
import { getItauAccessToken, registrarBoletoItau } from '@/app/lib/itauService';


async function getDadosParaBoleto(duplicataId, banco) {
    const { data: duplicata, error: dupError } = await supabase
        .from('duplicatas')
        .select('*, operacao:operacoes(cliente:clientes(*), tipo_operacao:tipos_operacao(*))')
        .eq('id', duplicataId)
        .single();
    if (dupError || !duplicata) throw new Error(`Duplicata com ID ${duplicataId} não encontrada.`);

    if (!duplicata.sacado_id) {
        throw new Error(`A duplicata ${duplicata.nf_cte} não possui um ID de sacado vinculado.`);
    }
    const { data: sacado, error: sacadoError } = await supabase
        .from('sacados')
        .select('*')
        .eq('id', duplicata.sacado_id)
        .single();
    if (sacadoError || !sacado) {
        throw new Error(`Sacado com ID ${duplicata.sacado_id} não encontrado.`);
    }

    const { cliente: cedente, tipo_operacao: tipoOperacao } = duplicata.operacao;

    if (banco === 'safra') {
        const idPart = duplicata.id.toString().slice(-4).padStart(4, '0');
        const randomPart = Math.floor(10000 + Math.random() * 90000).toString().slice(0, 5);
        const nossoNumeroUnico = `${idPart}${randomPart}`;

        return {
            agencia: "02900",
            conta: "005860430",
            documento: {
                numero: nossoNumeroUnico,
                numeroCliente: duplicata.nf_cte.substring(0, 10),
                especie: "02",
                dataVencimento: format(new Date(duplicata.data_vencimento + 'T12:00:00Z'), 'yyyy-MM-dd'),
                valor: parseFloat(duplicata.valor_bruto.toFixed(2)),
                pagador: {
                    nome: sacado.nome.replace(/\.$/, '').substring(0, 40),
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
    } else if (banco === 'itau') {
        if (!process.env.ITAU_ID_BENEFICIARIO) {
            throw new Error('A variável de ambiente ITAU_ID_BENEFICIARIO não está configurada.');
        }
        const isCpf = (sacado.cnpj || '').replace(/\D/g, '').length === 11;
        
        return {
            // CORREÇÃO FINAL: Adicionado o campo etapa_processo_boleto
            etapa_processo_boleto: "Validacao",
            beneficiario: {
                idBeneficiario: process.env.ITAU_ID_BENEFICIARIO,
            },
            codigoCarteira: "109",
            dataEmissao: format(new Date(duplicata.data_operacao + 'T12:00:00Z'), 'yyyy-MM-dd'),
            dataVencimento: format(new Date(duplicata.data_vencimento + 'T12:00:00Z'), 'yyyy-MM-dd'),
            valor: duplicata.valor_bruto.toFixed(2),
            seuNumero: duplicata.id.toString().padStart(1, '0'),
            especie: { codigoEspecie: "01" },
            pagador: {
                nomePagador: sacado.nome.replace(/\.$/, '').substring(0, 50),
                tipoPessoa: isCpf ? "Física" : "Jurídica",
                numeroDocumento: sacado.cnpj.replace(/\D/g, ''),
                endereco: {
                    logradouro: (sacado.endereco || 'NAO INFORMADO').substring(0, 45),
                    bairro: (sacado.bairro || 'NAO INFORMADO').substring(0, 15),
                    cidade: (sacado.municipio || 'NAO INFORMADO').substring(0, 20),
                    uf: sacado.uf || 'SP',
                    cep: (sacado.cep || '00000000').replace(/\D/g, '')
                }
            },
            juros: {
                codigoTipoJuros: tipoOperacao.taxa_juros_mora > 0 ? "02" : "0",
                percentualJuros: tipoOperacao.taxa_juros_mora > 0 ? tipoOperacao.taxa_juros_mora.toFixed(5) : "0"
            },
            multa: {
                codigoTipoMulta: tipoOperacao.taxa_multa > 0 ? "02" : "0",
                percentualMulta: tipoOperacao.taxa_multa > 0 ? tipoOperacao.taxa_multa.toFixed(2) : "0"
            }
        };
    }
    
    throw new Error("Banco inválido.");
}

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
                if (error.message && error.message.includes('DUPLICADOS')) {
                    const consultaParams = {
                        agencia: dadosParaBoleto.agencia,
                        conta: dadosParaBoleto.conta,
                        nossoNumero: dadosParaBoleto.documento.numero,
                        numeroCliente: dadosParaBoleto.documento.numeroCliente,
                    };
                    boletoGerado = await consultarBoletoSafra(tokenData.access_token, consultaParams);
                } else {
                    throw error;
                }
            }
            linhaDigitavel = boletoGerado.data?.documento?.codigoBarras || boletoGerado.data?.codigoBarras || 'N/A';
        
        } else if (banco === 'bradesco') {
            tokenData = await getBradescoAccessToken();
            boletoGerado = await registrarBoleto(tokenData.access_token, dadosParaBoleto);
            linhaDigitavel = boletoGerado.linhaDigitavel || 'N/A';
        
        } else if (banco === 'itau') {
            tokenData = await getItauAccessToken();
            boletoGerado = await registrarBoletoItau(tokenData.access_token, dadosParaBoleto);
            linhaDigitavel = boletoGerado.linhaDigitavel || 'N/A';
        } else {
            throw new Error("Banco selecionado inválido.");
        }
        
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