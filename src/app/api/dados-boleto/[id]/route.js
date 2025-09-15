// Substitua todo o conteúdo de: src/app/api/dados-boleto/[id]/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params; // ID da duplicata

        // 1. Busca a duplicata, cedente e sacado
        const { data: duplicata, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes(cliente_id)')
            .eq('id', id)
            .single();

        if (dupError) throw new Error('Duplicata não encontrada.');

        const { data: cedente, error: cedenteError } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', duplicata.operacao.cliente_id)
            .single();

        if (cedenteError) throw new Error('Dados do cedente não encontrados.');

        const { data: sacado, error: sacadoError } = await supabase
            .from('sacados')
            .select('*')
            .eq('nome', duplicata.cliente_sacado)
            .single();
        
        if (sacadoError) throw new Error(`Dados cadastrais do sacado "${duplicata.cliente_sacado}" não encontrados.`);

        // 2. Monta o payload no formato EXATO do seu Postman
        const payload = {
            "nuCPFCNPJ": cedente.cnpj.replace(/\D/g, ''),
            "filialCPFCNPJ": process.env.BRADESCO_FILIAL_CNPJ,
            "ctrlCPFCNPJ": process.env.BRADESCO_CTRL_CNPJ,
            "codigoUsuarioSolicitante": process.env.BRADESCO_CODIGO_USUARIO,
            "registraTitulo": {
                "idProduto": "9", // Fixo para cobrança
                "nuNegociacao": process.env.BRADESCO_CONTRATO_COBRANCA, // Da sua carteira de cobrança
                "nossoNumero": duplicata.id.toString().padStart(11, '0'),
                "dtEmissaoTitulo": duplicata.data_operacao.replace(/-/g, ''), // Formato YYYYMMDD
                "dtVencimentoTitulo": duplicata.data_vencimento.replace(/-/g, ''), // Formato YYYYMMDD
                "valorNominalTitulo": duplicata.valor_bruto.toFixed(2).replace('.', ''), // Valor em centavos
                "pagador": {
                    "nuCPFCNPJ": sacado.cnpj.replace(/\D/g, ''),
                    "nome": sacado.nome.substring(0, 40), // Limite de 40 caracteres
                    "logradouro": sacado.endereco.substring(0, 40),
                    "nuLogradouro": "0", // Ajuste se tiver o número separado
                    "bairro": sacado.bairro.substring(0, 15),
                    "cep": sacado.cep.replace(/\D/g, ''),
                    "cidade": sacado.municipio.substring(0, 15),
                    "uf": sacado.uf,
                }
            }
        };

        return NextResponse.json(payload);

    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}