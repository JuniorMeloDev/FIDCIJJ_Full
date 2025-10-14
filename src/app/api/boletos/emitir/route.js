import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import { format } from "date-fns";

// Serviços dos bancos
import {
  getSafraAccessToken,
  registrarBoletoSafra,
  consultarBoletoSafra,
} from "@/app/lib/safraService";
import {
  getBradescoAccessToken,
  registrarBoleto,
} from "@/app/lib/bradescoService";
import { getItauAccessToken, registrarBoletoItau } from "@/app/lib/itauService";

// ---------------------------
// Função para calcular o dígito (DAC) do Nosso Número Itaú
// ---------------------------
function calcularDacItau(nossoNumeroBase, codigoCarteira = "109") {
  const base = codigoCarteira + nossoNumeroBase; // Ex: "10900001540"
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  let pesoIndex = 0;

  for (let i = base.length - 1; i >= 0; i--) {
    soma += parseInt(base[i]) * pesos[pesoIndex];
    pesoIndex = (pesoIndex + 1) % pesos.length;
  }

  const resto = soma % 11;
  const dac = resto === 0 || resto === 1 ? 0 : 11 - resto;
  return dac.toString();
}

// ---------------------------
// Montagem de dados por banco
// ---------------------------
async function getDadosParaBoleto(duplicataId, banco, abatimento = 0) {
  const { data: duplicata, error: dupError } = await supabase
    .from("duplicatas")
    .select(
      "*, operacao:operacoes(id, cliente:clientes(*), tipo_operacao:tipos_operacao(*))"
    )
    .eq("id", duplicataId)
    .single();

  if (dupError || !duplicata)
    throw new Error(`Duplicata com ID ${duplicataId} não encontrada.`);

  if (!duplicata.sacado_id) {
    throw new Error(
      `A duplicata ${duplicata.nf_cte} não possui um ID de sacado vinculado.`
    );
  }

  const { data: sacado, error: sacadoError } = await supabase
    .from("sacados")
    .select("*")
    .eq("id", duplicata.sacado_id)
    .single();

  if (sacadoError || !sacado) {
    throw new Error(`Sacado com ID ${duplicata.sacado_id} não encontrado.`);
  }

  const { tipo_operacao: tipoOperacao } = duplicata.operacao;

  // ----------------- SAFRA -----------------
  if (banco === "safra") {
    const valorFinal = duplicata.valor_bruto - (abatimento || 0);

    const nossoNumeroUnico = `${duplicata.operacao.id}${duplicata.id}`
      .slice(-9)
      .padStart(9, "0");

    return {
      agencia: "02900",
      conta: "005860430",
      documento: {
        numero: nossoNumeroUnico,
        numeroCliente: duplicata.nf_cte.substring(0, 10),
        especie: "02",
        dataVencimento: format(
          new Date(duplicata.data_vencimento + "T12:00:00Z"),
          "yyyy-MM-dd"
        ),
        valor: parseFloat(valorFinal.toFixed(2)),
        quantidadeDiasProtesto: 5,
        valorAbatimento: parseFloat((abatimento || 0).toFixed(2)),
        pagador: {
          nome: sacado.nome.replace(/\.$/, "").substring(0, 40),
          tipoPessoa: (sacado.cnpj || "").length > 11 ? "J" : "F",
          numeroDocumento: (sacado.cnpj || "").replace(/\D/g, ""),
          endereco: {
            logradouro: (sacado.endereco || "NAO INFORMADO").substring(0, 40),
            bairro: (sacado.bairro || "NAO INFORMADO").substring(0, 10),
            cidade: (sacado.municipio || "NAO INFORMADO").substring(0, 15),
            uf: sacado.uf || "SP",
            cep: (sacado.cep || "00000000").replace(/\D/g, ""),
          },
        },
      },
    };
  }

  // ----------------- BRADESCO -----------------
  if (banco === "bradesco") {
    const valorFinal = duplicata.valor_bruto - (abatimento || 0);
    return {
      filialCPFCNPJ: process.env.BRADESCO_FILIAL_CNPJ,
      ctrlCPFCNPJ: process.env.BRADESCO_CTRL_CNPJ,
      codigoUsuarioSolicitante: process.env.BRADESCO_CODIGO_USUARIO,
      nuCPFCNPJ: process.env.BRADESCO_CPFCNPJ_RAIZ,
      registraTitulo: {
        idProduto: "9",
        nuNegociacao: process.env.BRADESCO_NU_NEGOCIACAO,
        nossoNumero: duplicata.id.toString().padStart(11, "0"),
        dtEmissaoTitulo: new Date(duplicata.data_operacao + "T12:00:00Z")
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, ""),
        dtVencimentoTitulo: new Date(duplicata.data_vencimento + "T12:00:00Z")
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, ""),
        valorNominalTitulo: Math.round(valorFinal * 100),
        pagador: {
          nuCPFCNPJ: (sacado.cnpj || "").replace(/\D/g, ""),
          nome: sacado.nome.substring(0, 40),
          logradouro: (sacado.endereco || "NAO INFORMADO").substring(0, 40),
          nuLogradouro: "0",
          bairro: (sacado.bairro || "NAO INFORMADO").substring(0, 15),
          cep: (sacado.cep || "00000000").replace(/\D/g, ""),
          cidade: (sacado.municipio || "NAO INFORMADO").substring(0, 15),
          uf: sacado.uf || "PE",
        },
        especieTitulo: "DM",
        percentualJuros: "0",
        valorJuros: "0",
        qtdeDiasJuros: "0",
        percentualMulta: "0",
        valorMulta: "0",
        qtdeDiasMulta: "0",
      },
    };
  }

  // ----------------- ITAÚ -----------------
  if (banco === "itau") {
    const valorComAbatimento = duplicata.valor_bruto - (abatimento || 0);
    if (valorComAbatimento <= 0)
      throw new Error(
        "O valor do abatimento não pode ser maior ou igual ao valor da duplicata."
      );

    // Base do Nosso Número (8 dígitos)
    const baseNossoNumero = duplicata.id.toString().padStart(8, "0");
    // Cálculo do DAC para impressão
    const dac = calcularDacItau(baseNossoNumero, "109");

    const isCpf = (sacado.cnpj || "").replace(/\D/g, "").length === 11;
    const valorFormatado = Math.round(valorComAbatimento * 100)
      .toString()
      .padStart(15, "0");

    const formatPercent = (value, decimalPlaces = 5, totalLength = 11) => {
      if (!value || value <= 0) return "0".padStart(totalLength, "0");
      const multiplier = Math.pow(10, decimalPlaces);
      return Math.round(value * multiplier)
        .toString()
        .padStart(totalLength, "0");
    };

    return {
      data: {
        etapa_processo_boleto: "Efetivacao",
        codigo_canal_operacao: "API",
        beneficiario: {
          id_beneficiario: process.env.ITAU_ID_BENEFICIARIO,
        },
        dado_boleto: {
          descricao_instrumento_cobranca: "boleto",
          tipo_boleto: "a vista",
          codigo_carteira: "109",
          codigo_especie: "01",
          valor_total_titulo: valorFormatado,
          valor_abatimento: "0",
          data_emissao: format(
            new Date(duplicata.data_operacao + "T12:00:00Z"),
            "yyyy-MM-dd"
          ),
          pagador: {
            pessoa: {
              nome_pessoa: sacado.nome.substring(0, 50),
              tipo_pessoa: {
                codigo_tipo_pessoa: isCpf ? "F" : "J",
                [isCpf
                  ? "numero_cadastro_pessoa_fisica"
                  : "numero_cadastro_nacional_pessoa_juridica"]:
                  sacado.cnpj.replace(/\D/g, ""),
              },
            },
            endereco: {
              nome_logradouro: (sacado.endereco || "NAO INFORMADO").substring(
                0,
                45
              ),
              nome_bairro: (sacado.bairro || "NAO INFORMADO").substring(0, 15),
              nome_cidade: (sacado.municipio || "NAO INFORMADO").substring(
                0,
                20
              ),
              sigla_UF: sacado.uf || "SP",
              numero_CEP: (sacado.cep || "00000000").replace(/\D/g, ""),
            },
          },
          dados_individuais_boleto: [
            {
              numero_nosso_numero: baseNossoNumero, // ✅ apenas 8 dígitos
              data_vencimento: format(
                new Date(duplicata.data_vencimento + "T12:00:00Z"),
                "yyyy-MM-dd"
              ),
              valor_titulo: valorFormatado,
              texto_seu_numero: duplicata.id.toString(),
            },
          ],
          multa: {
            codigo_tipo_multa: tipoOperacao.taxa_multa > 0 ? "02" : "0",
            percentual_multa: formatPercent(tipoOperacao.taxa_multa),
          },
          juros: {
            codigo_tipo_juros: tipoOperacao.taxa_juros_mora > 0 ? "90" : "0",
            percentual_juros: formatPercent(tipoOperacao.taxa_juros_mora),
          },
          protesto: {
            codigo_tipo_protesto: "9", // ✅ válido
            quantidade_dias_protesto: "5",
          },
          recebimento_divergente: { codigo_tipo_autorizacao: "03" },
          desconto_expresso: false,
        },
      },
    };
  }

  throw new Error("Banco inválido.");
}

// ---------------------------
// Método POST principal
// ---------------------------
export async function POST(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    const { duplicataId, banco, abatimento } = await request.json();
    const dadosParaBoleto = await getDadosParaBoleto(
      duplicataId,
      banco,
      abatimento
    );

    let boletoGerado;
    let linhaDigitavelParaRetorno;
    let dadosParaSalvar;

    if (banco === "safra") {
      const tokenData = await getSafraAccessToken();
      boletoGerado = await registrarBoletoSafra(
        tokenData.access_token,
        dadosParaBoleto
      );
      linhaDigitavelParaRetorno =
        boletoGerado.data?.documento?.linhaDigitavel ||
        boletoGerado.data?.linhaDigitavel ||
        "N/A";
      dadosParaSalvar =
        boletoGerado.data?.documento?.codigoBarras ||
        boletoGerado.data?.codigoBarras ||
        linhaDigitavelParaRetorno;
    } else if (banco === "bradesco") {
      const tokenData = await getBradescoAccessToken();
      boletoGerado = await registrarBoleto(
        tokenData.access_token,
        dadosParaBoleto
      );
      linhaDigitavelParaRetorno = boletoGerado.linhaDigitavel || "N/A";
      dadosParaSalvar = boletoGerado.codigoBarras || linhaDigitavelParaRetorno;
    } else if (banco === "itau") {
      const tokenData = await getItauAccessToken();
      boletoGerado = await registrarBoletoItau(
        tokenData.access_token,
        dadosParaBoleto
      );
      const dadosIndividuais =
        boletoGerado?.data?.dado_boleto?.dados_individuais_boleto[0];
      linhaDigitavelParaRetorno = dadosIndividuais?.linha_digitavel || "N/A";
      dadosParaSalvar =
        dadosIndividuais?.codigo_barras || linhaDigitavelParaRetorno;
    } else {
      throw new Error("Banco selecionado inválido.");
    }

    const { error: updateError } = await supabase
      .from("duplicatas")
      .update({
        linha_digitavel: dadosParaSalvar,
        banco_emissor_boleto: banco,
        valor_abatimento: abatimento || 0,
      })
      .eq("id", duplicataId);

    if (updateError) {
      return NextResponse.json({
        success: true,
        linhaDigitavel: linhaDigitavelParaRetorno,
        warning: "Boleto emitido, mas falha ao salvar no banco.",
      });
    }

    return NextResponse.json({
      success: true,
      linhaDigitavel: linhaDigitavelParaRetorno,
    });
  } catch (error) {
    console.error(`Erro na API de emissão de boleto: ${error.message}`);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
