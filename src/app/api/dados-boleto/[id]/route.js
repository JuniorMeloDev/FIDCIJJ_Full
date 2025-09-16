import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

const formatDate = (d) => new Date(d + 'T12:00:00Z').toISOString().slice(0,10).replace(/-/g,'');
const toCents = (v) => Math.round(Number(v) * 100);

export async function GET(request,{params}) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ message:'Não autorizado'}, {status:401});
    jwt.verify(token, process.env.JWT_SECRET);

    const { id } = params;

    const { data: duplicata } = await supabase
      .from('duplicatas').select('*, operacao:operacoes(cliente_id)').eq('id',id).single();

    const { data: cedente } = await supabase
      .from('clientes').select('*, contas_bancarias(*)')
      .eq('id', duplicata.operacao.cliente_id).single();

    const conta = cedente.contas_bancarias[0];
    const agencia = conta.agencia.replace(/\D/g,'').padStart(5,'0');
    const contaCorr = conta.conta_corrente.replace(/\D/g,'').padStart(8,'0');

    const { data: sacado } = await supabase
      .from('sacados').select('*').eq('nome', duplicata.cliente_sacado).single();

    const payload = {
      nuCPFCNPJ: cedente.cnpj.replace(/\D/g,''),
      filialCPFCNPJ: process.env.BRADESCO_FILIAL_CNPJ,
      ctrlCPFCNPJ: process.env.BRADESCO_CTRL_CNPJ,
      codigoUsuarioSolicitante: process.env.BRADESCO_CODIGO_USUARIO,
      registraTitulo: {
        idProduto: 9,
        nuNegociacao: `${process.env.BRADESCO_CARTEIRA}${agencia}${contaCorr}`,
        nossoNumero: duplicata.id.toString().padStart(11,'0'),
        dtEmissaoTitulo: formatDate(duplicata.data_operacao),
        dtVencimentoTitulo: formatDate(duplicata.data_vencimento),
        valorNominalTitulo: toCents(duplicata.valor_bruto),
        pagador: {
          nuCPFCNPJ: sacado.cnpj.replace(/\D/g,''),
          nome: sacado.nome.substring(0,40),
          logradouro: (sacado.endereco || 'NAO INFORMADO').substring(0,40),
          nuLogradouro: '0',
          bairro: (sacado.bairro || 'NAO INFORMADO').substring(0,15),
          cep: (sacado.cep || '00000000').replace(/\D/g,''),
          cidade: (sacado.municipio || 'NAO INFORMADO').substring(0,15),
          uf: sacado.uf || 'PE'
        },
        especieTitulo: 'DM',
        percentualJuros: 0,
        valorJuros: 0,
        qtdeDiasJuros: 0,
        percentualMulta: 0,
        valorMulta: 0,
        qtdeDiasMulta: 0
      }
    };

    console.log('Payload final montado:', JSON.stringify(payload,null,2));
    return NextResponse.json(payload);

  } catch (e) {
    console.error('Erro em /api/dados-boleto:', e);
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
