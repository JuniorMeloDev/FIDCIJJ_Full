// src/app/api/dados-boleto/[id]/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;

        // 1. Busca a duplicata e a operação associada para encontrar o cedente e o sacado
        const { data: duplicata, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes(cliente_id)')
            .eq('id', id)
            .single();

        if (dupError) throw new Error('Duplicata não encontrada.');

        // 2. Busca os dados completos do cedente (beneficiário) e sua conta bancária principal
        const { data: cedente, error: cedenteError } = await supabase
            .from('clientes')
            .select('*, contas_bancarias(*)')
            .eq('id', duplicata.operacao.cliente_id)
            .single();

        if (cedenteError || !cedente || cedente.contas_bancarias.length === 0) {
            throw new Error('Dados do cedente ou conta bancária não encontrados.');
        }

        // 3. Busca os dados completos do sacado (pagador)
        const { data: sacado, error: sacadoError } = await supabase
            .from('sacados')
            .select('*')
            .eq('nome', duplicata.cliente_sacado) // Assumindo que o nome é único. O ideal seria ter o ID.
            .single();
        
        if (sacadoError || !sacado) {
            throw new Error(`Dados cadastrais do sacado "${duplicata.cliente_sacado}" não encontrados.`);
        }

        // 4. Monta o payload do boleto com os dados reais do seu banco de dados
        const dadosBoleto = {
            beneficiario: {
                agencia: cedente.contas_bancarias[0].agencia,
                conta: cedente.contas_bancarias[0].conta_corrente,
                nome: cedente.nome,
                documento: cedente.cnpj
            },
            pagador: {
                nome: sacado.nome,
                documento: sacado.cnpj,
                endereco: {
                    logradouro: sacado.endereco,
                    bairro: sacado.bairro,
                    cidade: sacado.municipio,
                    uf: sacado.uf,
                    cep: sacado.cep
                }
            },
            nossoNumero: duplicata.id.toString().padStart(11, '0'),
            valor: duplicata.valor_bruto,
            dataVencimento: duplicata.data_vencimento,
            instrucoes: [`Referente a NF ${duplicata.nf_cte}`]
        };

        return NextResponse.json(dadosBoleto);

    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}