import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { format } from 'date-fns';

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

        // --- LÓGICA DE CORREÇÃO DO NOSSO NÚMERO ---
        // Gera um número de 9 dígitos único para cada tentativa, usando parte do ID da duplicata
        // e um sufixo aleatório. Isso evita colisões no ambiente de testes do Safra.
        const idPart = duplicata.id.toString().slice(-4).padStart(4, '0');
        const randomPart = Math.floor(10000 + Math.random() * 90000).toString().slice(0, 5);
        const nossoNumeroUnico = `${idPart}${randomPart}`;
        // --- FIM DA CORREÇÃO ---
        
        const payload = {
            agencia: "12400",
            conta: "008554440",
            documento: {
                numero: nossoNumeroUnico, // Utiliza o número único gerado
                numeroCliente: duplicata.nf_cte.substring(0, 10),
                especie: "02",
                dataVencimento: formatDateToSafra(duplicata.data_vencimento),
                valor: formatValueToSafra(duplicata.valor_bruto),
                pagador: {
                    nome: sacado.nome.substring(0, 40),
                    tipoPessoa: (sacado.cnpj || '').length > 11 ? "J" : "F",
                    numeroDocumento: (sacado.cnpj || '').replace(/\D/g, ''),
                    endereco: {
                        logradouro: (sacado.endereco || 'NAO INFORMADO').substring(0, 40),
                        bairro: (sacado.bairro || 'NAO INFORMADO').substring(0, 15),
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