import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { format } from 'date-fns';

const formatDateToSafra = (dateString) => {
    if (!dateString) return '';
    // O formato esperado é YYYY-MM-DD
    return format(new Date(dateString), 'yyyy-MM-dd');
};

const formatValueToSafra = (value) => {
    if (typeof value !== 'number') return 0;
    // O valor é enviado como número, sem multiplicação por 100
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
            .select('*, operacao:operacoes(cliente:clientes(agencia, conta))')
            .eq('id', id)
            .single();

        if (dupError || !duplicata) {
            throw new Error('Duplicata não encontrada ou dados da operação incompletos.');
        }

        const { data: sacado, error: sacadoError } = await supabase
            .from('sacados')
            .select('*')
            .eq('nome', duplicata.cliente_sacado)
            .limit(1)
            .single();

        if (sacadoError || !sacado) {
            throw new Error(`Dados cadastrais do sacado "${duplicata.cliente_sacado}" não encontrados.`);
        }

        const payload = {
            agencia: duplicata.operacao.cliente.agencia,
            conta: duplicata.operacao.cliente.conta,
            documento: {
                numero: duplicata.id.toString(),
                numeroCliente: duplicata.nf_cte.substring(0, 10),
                especie: "02", // DM - Duplicata Mercantil
                dataVencimento: formatDateToSafra(duplicata.data_vencimento),
                valor: formatValueToSafra(duplicata.valor_bruto),
                pagador: {
                    nome: sacado.nome.substring(0, 40),
                    tipoPessoa: sacado.cnpj.length > 11 ? "J" : "F",
                    numeroDocumento: sacado.cnpj.replace(/\D/g, ''),
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

        return NextResponse.json(payload);

    } catch (error) {
        console.error("Erro em /api/dados-boleto/safra:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}