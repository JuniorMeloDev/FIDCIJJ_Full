import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { format } from 'date-fns';

const formatDateToSafra = (dateString) => {
    if (!dateString) return '';
    // Adiciona o fuso para evitar problemas de conversão e formata para YYYY-MM-DD
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

        // Query corrigida para buscar apenas os dados necessários sem causar erro
        const { data: duplicata, error: dupError } = await supabase
            .from('duplicatas')
            .select('*')
            .eq('id', id)
            .single();

        if (dupError || !duplicata) {
            console.error('Erro ao buscar duplicata:', dupError);
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
        
        // Payload montado com os dados de teste do Safra
        const payload = {
            agencia: "12400", // CONTA DE TESTE FORNECIDA PELO SAFRA
            conta: "008554440", // CONTA DE TESTE FORNECIDA PELO SAFRA
            documento: {
                numero: duplicata.id.toString(),
                numeroCliente: duplicata.nf_cte.substring(0, 10),
                especie: "02", // DM - Duplicata Mercantil
                dataVencimento: formatDateToSafra(duplicata.data_vencimento),
                valor: formatValueToSafra(duplicata.valor_bruto),
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

        return NextResponse.json(payload);

    } catch (error) {
        console.error("Erro em /api/dados-boleto/safra:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}