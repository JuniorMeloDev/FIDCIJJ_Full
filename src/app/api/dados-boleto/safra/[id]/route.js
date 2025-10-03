import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { format, addDays } from 'date-fns';

const formatDateToSafra = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T12:00:00Z');
    return format(date, 'yyyy-MM-dd');
};

const formatValueToSafra = (value) => {
    if (typeof value !== 'number') return 0;
    return parseFloat(value.toFixed(2));
};

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;

        const { data: duplicata, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes(*, tipo_operacao:tipos_operacao(*))')
            .eq('id', id)
            .single();

        if (dupError || !duplicata || !duplicata.operacao || !duplicata.operacao.tipo_operacao) {
            throw new Error('Duplicata ou dados da operação relacionados não encontrados.');
        }

        const { data: sacado, error: sacadoError } = await supabase
            .from('sacados')
            .select('*')
            .eq('id', duplicata.sacado_id)
            .single();

        if (sacadoError || !sacado) {
            throw new Error(`Dados cadastrais do sacado "${duplicata.cliente_sacado}" não encontrados.`);
        }

        const tipoOperacao = duplicata.operacao.tipo_operacao;
        const nossoNumeroUnico = duplicata.id.toString().padStart(9, '0');
        
        const jurosConfig = {};
        if (tipoOperacao.taxa_juros_mora > 0) {
            jurosConfig.tipoJuros = "TAXAMENSAL";
            jurosConfig.valor = tipoOperacao.taxa_juros_mora;
            jurosConfig.data = format(addDays(new Date(duplicata.data_vencimento + 'T12:00:00Z'), 1), 'yyyy-MM-dd');
        } else {
            jurosConfig.tipoJuros = "ISENTO";
        }

        const multaConfig = {};
        if (tipoOperacao.taxa_multa > 0) {
            multaConfig.tipoMulta = "PERCENTUAL";
            multaConfig.percentual = tipoOperacao.taxa_multa;
            multaConfig.data = format(addDays(new Date(duplicata.data_vencimento + 'T12:00:00Z'), 1), 'yyyy-MM-dd');
        } else {
            multaConfig.tipoMulta = "ISENTO";
        }

        const payload = {
            agencia: "02900",
            conta: "005860430",
            codigoMoeda: "09",
            documento: {
                numero: nossoNumeroUnico,
                numeroCliente: duplicata.nf_cte.substring(0, 10),
                especie: "DM",
                carteira: "01",
                dataVencimento: formatDateToSafra(duplicata.data_vencimento),
                valor: formatValueToSafra(duplicata.valor_bruto),
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
                },
                juros: jurosConfig,
                multa: multaConfig
            }
        };

        return NextResponse.json(payload);

    } catch (error) {
        console.error("Erro em /api/dados-boleto/safra:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}