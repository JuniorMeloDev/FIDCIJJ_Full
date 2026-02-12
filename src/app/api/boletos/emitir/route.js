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
import {
  getInterAccessToken,
  emitirCobrancaInter,
  consultarCobrancaInter,
} from "@/app/lib/interService";

// Função Dac Itaú (mantida igual)
function calcularDacItau(nossoNumeroBase, codigoCarteira = "109") {
  // ... (código da função calcularDacItau - sem alterações)
  const base = codigoCarteira + nossoNumeroBase;
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
const toOnlyDigits = (value) => String(value || "").replace(/\D/g, "");
const toUpperAscii = (value, fallback = "") =>
  String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
const toBradescoAlnum = (value, fallback = "") => {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || fallback).slice(0, 50);
};
const toDateBradesco = (dateString) =>
  format(new Date(`${dateString}T12:00:00Z`), "dd.MM.yyyy");
const toMoneyBradesco = (value) => Number((Number(value) || 0).toFixed(2));
const toMoneyBradescoString = (value) => (Number(value) || 0).toFixed(2);
const toPercentBradesco = (value) => Number((Number(value) || 0).toFixed(3));
const toStringSafe = (value) => String(value ?? "");
const isBradescoSandbox = () => {
  const base = String(process.env.BRADESCO_API_BASE_URL || process.env.BRADESCO_BASE_URL || "").toLowerCase();
  return base.includes("sandbox") || base.includes("prebanco");
};

// Função getDadosParaBoleto (com modificação para Itaú)
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
  if (!duplicata.sacado_id) throw new Error(`Duplicata ${duplicata.nf_cte} não possui ID de sacado.`);

  const { data: sacado, error: sacadoError } = await supabase
    .from("sacados")
    .select("*")
    .eq("id", duplicata.sacado_id)
    .single();

  if (sacadoError || !sacado) throw new Error(`Sacado ID ${duplicata.sacado_id} não encontrado.`);

  const { tipo_operacao: tipoOperacao } = duplicata.operacao;

  // SAFRA (sem alterações)
  if (banco === "safra") {
     const valorFinal = duplicata.valor_bruto - (abatimento || 0);
     const nossoNumeroUnico = `${duplicata.operacao.id}${duplicata.id}`.slice(-9).padStart(9, "0");
     return {
        // ... (objeto de dados do Safra - sem alterações)
        agencia: process.env.SAFRA_AGENCIA,
        conta: process.env.SAFRA_CONTA,
        documento: {
          numero: nossoNumeroUnico,
          numeroCliente: duplicata.nf_cte.substring(0, 10),
          especie: "02",
          dataVencimento: format(new Date(duplicata.data_vencimento + "T12:00:00Z"),"yyyy-MM-dd"),
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

  // BRADESCO
  if (banco === "bradesco") {
    const valorFinal = duplicata.valor_bruto - (abatimento || 0);
    if (valorFinal <= 0) throw new Error("Valor com abatimento invalido.");

    const pagadorDoc = toOnlyDigits(sacado.cnpj);
    if (!pagadorDoc) throw new Error(`Sacado ${sacado.id} sem CPF/CNPJ para emissao Bradesco.`);

    const isCpfPagador = pagadorDoc.length <= 11;
    const cepDigits = toOnlyDigits(sacado.cep).padStart(8, "0").slice(-8);
    const cepBase = Number(cepDigits.slice(0, 5));
    const cepComplemento = Number(cepDigits.slice(5));

    const enderecoRaw = (sacado.endereco || "NAO INFORMADO").trim();
    const enderecoPartes = enderecoRaw.split(",");
    const logradouro = (enderecoPartes[0] || "NAO INFORMADO").trim().slice(0, 100);
    const numeroEndereco = (enderecoPartes[1] || "0").replace(/[^\d]/g, "").slice(0, 10) || "0";

    const jurosPercentual = toPercentBradesco(tipoOperacao?.taxa_juros_mora || 0);
    const multaPercentual = toPercentBradesco(tipoOperacao?.taxa_multa || 0);
    const nuTitulo = String(duplicata.id).padStart(11, "0").slice(-11);
    const nuCliente = String(duplicata.nf_cte || `DUP-${duplicata.id}`).slice(0, 25);
    const mensagem = `REFERENTE A NF ${String(duplicata.nf_cte || duplicata.id)}`.slice(0, 80);

    const nuCpfCnpjBeneficiario = toOnlyDigits(process.env.BRADESCO_CPFCNPJ_RAIZ);
    const filialCpfCnpjBeneficiario = toOnlyDigits(process.env.BRADESCO_FILIAL_CNPJ);
    const ctrlCpfCnpjBeneficiario = toOnlyDigits(process.env.BRADESCO_CTRL_CNPJ);
    const nuNegociacao = toOnlyDigits(process.env.BRADESCO_NU_NEGOCIACAO);

    if (!nuCpfCnpjBeneficiario || !filialCpfCnpjBeneficiario || !ctrlCpfCnpjBeneficiario || !nuNegociacao) {
      throw new Error(
        "Configuracao Bradesco incompleta: BRADESCO_CPFCNPJ_RAIZ, BRADESCO_FILIAL_CNPJ, BRADESCO_CTRL_CNPJ e BRADESCO_NU_NEGOCIACAO sao obrigatorias."
      );
    }

    const payloadBase = {
      codigoUsuarioSolicitante: toStringSafe(process.env.BRADESCO_CODIGO_USUARIO || "APISERVIC"),
      debitoAutomatico: toStringSafe(process.env.BRADESCO_DEBITO_AUTOMATICO || "N"),
      nuCPFCNPJ: toStringSafe(nuCpfCnpjBeneficiario),
      filialCPFCNPJ: toStringSafe(filialCpfCnpjBeneficiario),
      ctrlCPFCNPJ: toStringSafe(ctrlCpfCnpjBeneficiario),
      idProduto: toStringSafe(process.env.BRADESCO_ID_PRODUTO || 9),
      nuNegociacao: toStringSafe(nuNegociacao),
      nuTitulo: toStringSafe(nuTitulo),
      nuCliente: toStringSafe(nuCliente),
      dtEmissaoTitulo: toDateBradesco(duplicata.data_operacao),
      dtVencimentoTitulo: toDateBradesco(duplicata.data_vencimento),
      indicadorMoeda: "1",
      vlNominalTitulo: toMoneyBradescoString(valorFinal),
      cdEspecieTitulo: toStringSafe(process.env.BRADESCO_CD_ESPECIE_TITULO || 1),
      tpProtestoAutomaticoNegativacao: "0",
      prazoProtestoAutomaticoNegativacao: "0",
      controleParticipante: "",
      cdPagamentoParcial: "N",
      qtdePagamentoParcial: "0",
      tipoPrazoDecursoTres: toStringSafe(process.env.BRADESCO_TIPO_PRAZO_DECURSO_TRES || 0),
      percentualJuros: toStringSafe(jurosPercentual),
      vlJuros: "0",
      qtdeDiasJuros: toStringSafe(jurosPercentual > 0 ? 1 : 0),
      percentualMulta: toStringSafe(multaPercentual),
      vlMulta: "0",
      qtdeDiasMulta: toStringSafe(multaPercentual > 0 ? 1 : 0),
      percentualDesconto1: "0",
      vlDesconto1: "0",
      dataLimiteDesconto1: toDateBradesco(duplicata.data_vencimento),
      percentualDesconto2: "0",
      vlDesconto2: "0",
      dataLimiteDesconto2: "",
      percentualDesconto3: "0",
      vlDesconto3: "0",
      dataLimiteDesconto3: "",
      prazoBonificacao: "0",
      percentualBonificacao: "0",
      vlBonificacao: "0",
      dtLimiteBonificacao: "",
      vlAbatimento: toStringSafe(toMoneyBradesco(abatimento || 0)),
      vlIOF: "0",
      nomePagador: (sacado.nome || "NAO INFORMADO").slice(0, 70),
      logradouroPagador: logradouro,
      nuLogradouroPagador: numeroEndereco,
      complementoLogradouroPagador: (sacado.complemento || "").slice(0, 30),
      tpVencimento: "0",
      cepPagador: toStringSafe(cepBase),
      complementoCepPagador: toStringSafe(cepComplemento),
      bairroPagador: toBradescoAlnum(sacado.bairro, "CENTRO"),
      municipioPagador: (sacado.municipio || "NAO INFORMADO").slice(0, 50),
      ufPagador: (sacado.uf || "SP").slice(0, 2).toUpperCase(),
      cdIndCpfcnpjPagador: toStringSafe(isCpfPagador ? 1 : 2),
      nuCpfcnpjPagador: toStringSafe(pagadorDoc),
      endEletronicoPagador: (sacado.email || "").slice(0, 100),
      dddFoneSacado: "",
      foneSacado: "",
      bancoDoDebAutomatico: "0",
      agenciaDoDebAutomatico: "0",
      digitoAgenciaDoDebAutomat: "0",
      contaDoDebAutomatico: "0",
      razaoDoDebAutomatico: "0",
      // Campos exigidos por alguns contratos Bradesco (layout "default.json")
      nomeSacadorAvalista: "",
      logradouroSacadorAvalista: "",
      enderecoSacadorAvalista: "",
      nuLogradouroSacadorAvalista: "",
      complementoLogradouroSacadorAvalista: "",
      bairroSacadorAvalista: "",
      municipioSacadorAvalista: "",
      ufSacadorAvalista: "",
      cepSacadorAvalista: "0",
      complementoCepSacadorAvalista: "0",
      cdIndCpfcnpjSacadorAvalista: "0",
      nuCpfcnpjSacadorAvalista: "",
      dddFoneSacadorAvalista: "0",
      foneSacadorAvalista: "0",
      cindcdAceitSacdo: "N",
      listaMsgs: [{ mensagem }],
      // Alguns ambientes validam também a mensagem no formato flatten.
      listaMsgs_1_mensagem: mensagem,
    };

    // Sandbox Bradesco trabalha por "cenarios" predefinidos.
    // Neste modo, enviamos um payload aderente ao exemplo oficial para aumentar compatibilidade.
    if (isBradescoSandbox()) {
      return {
        debitoAutomatico: "S",
        nuCPFCNPJ: Number(nuCpfCnpjBeneficiario),
        filialCPFCNPJ: Number(filialCpfCnpjBeneficiario),
        ctrlCPFCNPJ: Number(ctrlCpfCnpjBeneficiario),
        idProduto: Number(process.env.BRADESCO_ID_PRODUTO || 9),
        nuNegociacao: Number(nuNegociacao),
        nuTitulo: 0,
        nuCliente: ".",
        dtEmissaoTitulo: toDateBradesco(duplicata.data_operacao),
        dtVencimentoTitulo: toDateBradesco(duplicata.data_vencimento),
        indicadorMoeda: 1,
        vlNominalTitulo: toMoneyBradescoString(valorFinal),
        cdEspecieTitulo: Number(process.env.BRADESCO_CD_ESPECIE_TITULO || 1),
        tpProtestoAutomaticoNegativacao: 0,
        prazoProtestoAutomaticoNegativacao: 0,
        controleParticipante: "",
        cdPagamentoParcial: "",
        qtdePagamentoParcial: 0,
        tipoPrazoDecursoTres: 1,
        percentualJuros: toPercentBradesco(tipoOperacao?.taxa_juros_mora || 0),
        vlJuros: 0,
        qtdeDiasJuros: (tipoOperacao?.taxa_juros_mora || 0) > 0 ? 1 : 0,
        percentualMulta: toPercentBradesco(tipoOperacao?.taxa_multa || 0),
        vlMulta: 0,
        qtdeDiasMulta: (tipoOperacao?.taxa_multa || 0) > 0 ? 1 : 0,
        percentualDesconto1: 0,
        vlDesconto1: 0,
        dataLimiteDesconto1: toDateBradesco(duplicata.data_vencimento),
        percentualDesconto2: 0,
        vlDesconto2: 0,
        dataLimiteDesconto2: toDateBradesco(duplicata.data_vencimento),
        percentualDesconto3: 0,
        vlDesconto3: 0,
        dataLimiteDesconto3: "",
        prazoBonificacao: 0,
        percentualBonificacao: 0,
        vlBonificacao: 0,
        dtLimiteBonificacao: toDateBradesco(duplicata.data_vencimento),
        vlAbatimento: toMoneyBradescoString(abatimento || 0),
        vlIOF: 0,
        nomePagador: toUpperAscii(sacado.nome || "PAGADOR").slice(0, 70),
        logradouroPagador: toUpperAscii(logradouro, "RUA").slice(0, 70),
        nuLogradouroPagador: numeroEndereco || "0",
        complementoLogradouroPagador: toUpperAscii(sacado.complemento || "").slice(0, 30),
        cepPagador: Number(cepBase || 0),
        complementoCepPagador: Number(cepComplemento || 0),
        bairroPagador: toBradescoAlnum(sacado.bairro, "CENTRO"),
        municipioPagador: toUpperAscii(sacado.municipio || "BARUERI").slice(0, 50),
        ufPagador: (sacado.uf || "SP").slice(0, 2).toUpperCase(),
        cdIndCpfcnpjPagador: isCpfPagador ? 1 : 2,
        nuCpfcnpjPagador: Number(pagadorDoc),
        endEletronicoPagador: "",
        dddFoneSacado: 0,
        foneSacado: 0,
        bancoDoDebAutomatico: Number(process.env.BRADESCO_BANCO_DEBITO_AUTOMATICO || 237),
        agenciaDoDebAutomatico: Number(process.env.BRADESCO_AGENCIA || 0),
        digitoAgenciaDoDebAutomat: Number(process.env.BRADESCO_AGENCIA_DV || 0),
        contaDoDebAutomatico: Number(process.env.BRADESCO_CONTA || 0),
        razaoDoDebAutomatico: Number(process.env.BRADESCO_RAZAO_DEBITO_AUTOMATICO || 705),
        codBancoDoProtesto: 0,
        agenciaDoProtesto: 0,
        // Campos exigidos por alguns cenarios sandbox
        nomeSacadorAvalista: "",
        logradouroSacadorAvalista: "",
        enderecoSacadorAvalista: "",
        nuLogradouroSacadorAvalista: "",
        complementoLogradouroSacadorAvalista: "",
        bairroSacadorAvalista: "",
        municipioSacadorAvalista: "",
        ufSacadorAvalista: "",
        cepSacadorAvalista: 0,
        complementoCepSacadorAvalista: 0,
        cdIndCpfcnpjSacadorAvalista: 0,
        nuCpfcnpjSacadorAvalista: "",
        dddFoneSacadorAvalista: 0,
        foneSacadorAvalista: 0,
        cindcdAceitSacdo: "N",
        listaMsgs: [{ mensagem }],
        listaMsgs_1_mensagem: mensagem,
      };
    }

    return payloadBase;
  }

  // ITAU (com alteração no texto_seu_numero)
  if (banco === "itau") {
    const valorComAbatimento = duplicata.valor_bruto - (abatimento || 0);
    if (valorComAbatimento <= 0) throw new Error("Valor com abatimento inválido.");

    const baseNossoNumero = duplicata.id.toString().padStart(8, "0");
    const isCpf = (sacado.cnpj || "").replace(/\D/g, "").length === 11;
    // Corrigindo para usar valorComAbatimento
    const valorFormatado = Math.round(valorComAbatimento * 100).toString().padStart(15, "0");
    
    // Função helper interna para formatar percentuais
    const formatPercent = (value, decimalPlaces = 5, totalLength = 11) => {
        const floatValue = parseFloat(value) || 0;
        const fixedValue = floatValue.toFixed(decimalPlaces);
        return fixedValue.replace(".", "").padStart(totalLength, "0");
    };

    return {
      data: {
        etapa_processo_boleto: "Efetivacao",
        codigo_canal_operacao: "API",
        beneficiario: { id_beneficiario: process.env.ITAU_ID_BENEFICIARIO, },
        dado_boleto: {
          descricao_instrumento_cobranca: "boleto",
          tipo_boleto: "a vista",
          codigo_carteira: process.env.ITAU_BOLETO_CARTEIRA || "109", // Usando variável de ambiente
          codigo_especie: "01", // 01 = DM
          valor_total_titulo: valorFormatado,
          valor_abatimento: "0", // O abatimento já foi aplicado no valor_total_titulo
          data_emissao: format(new Date(duplicata.data_operacao + "T12:00:00Z"), "yyyy-MM-dd"),
          pagador: {
            pessoa: {
              nome_pessoa: sacado.nome.substring(0, 50),
              tipo_pessoa: {
                codigo_tipo_pessoa: isCpf ? "F" : "J",
                [isCpf ? "numero_cadastro_pessoa_fisica" : "numero_cadastro_nacional_pessoa_juridica"]: sacado.cnpj.replace(/\D/g, ""),
              },
            },
            endereco: {
              nome_logradouro: (sacado.endereco || "NAO INFORMADO").substring(0, 45),
              nome_bairro: (sacado.bairro || "NAO INFORMADO").substring(0, 15),
              nome_cidade: (sacado.municipio || "NAO INFORMADO").substring(0, 20),
              sigla_UF: sacado.uf || "SP",
              numero_CEP: (sacado.cep || "00000000").replace(/\D/g, ""),
            },
          },
          dados_individuais_boleto: [
            {
              numero_nosso_numero: baseNossoNumero,
              data_vencimento: format(new Date(duplicata.data_vencimento + "T12:00:00Z"), "yyyy-MM-dd"),
              valor_titulo: valorFormatado,
              
              // --- ESTA É A ALTERAÇÃO ---
              // Usa nf_cte (Seu Número) no campo texto_seu_numero da API
              texto_seu_numero: duplicata.nf_cte,
              // --- FIM DA ALTERAÇÃO ---
            },
          ],
          multa: { 
            codigo_tipo_multa: tipoOperacao.taxa_multa > 0 ? "02" : "0", // 02 = Percentual
            percentual_multa: formatPercent(tipoOperacao.taxa_multa), 
          },
          juros: { 
            codigo_tipo_juros: tipoOperacao.taxa_juros_mora > 0 ? "90" : "0", // 90 = Percentual ao Mês
            percentual_juros: formatPercent(tipoOperacao.taxa_juros_mora),
          },
           //protesto: {
           // codigo_tipo_protesto: "1", // 01 = Protestar Dias Corridos
         //   quantidade_dias_protesto: "5",
         // },
          recebimento_divergente: { codigo_tipo_autorizacao: "03" }, // 03 = Aceita qualquer valor
          desconto_expresso: false,
        },
      },
    };
  }

  // INTER (Boleto com Pix V3)
  if (banco === "inter") {
    const valorComAbatimento = duplicata.valor_bruto - (abatimento || 0);
    if (valorComAbatimento <= 0) throw new Error("Valor com abatimento inválido.");

    const cleanCpfCnpj = (sacado.cnpj || "").replace(/\D/g, "");
    const isCpf = cleanCpfCnpj.length === 11;

    const enderecoRaw = (sacado.endereco || "NAO INFORMADO").trim();
    let endereco = enderecoRaw;
    let numero = "0";
    if (enderecoRaw.includes(",")) {
      const parts = enderecoRaw.split(",");
      endereco = parts[0].trim() || enderecoRaw;
      numero = (parts.slice(1).join(",").trim() || "0").substring(0, 10);
    }

    const telefoneRaw = (sacado.fone || "").replace(/\D/g, "");
    const ddd = telefoneRaw.length >= 10 ? telefoneRaw.substring(0, 2) : undefined;
    const telefone = telefoneRaw.length >= 10 ? telefoneRaw.substring(2) : undefined;

    const nfCteClean = (duplicata.nf_cte || "").replace(/[^0-9A-Za-z]/g, "");
    const seuNumeroBase = nfCteClean || duplicata.id.toString();
    const seuNumero = seuNumeroBase.length > 15 ? seuNumeroBase.slice(-15) : seuNumeroBase;

    return {
      seuNumero,
      valorNominal: parseFloat(valorComAbatimento.toFixed(2)),
      dataVencimento: format(new Date(duplicata.data_vencimento + "T12:00:00Z"), "yyyy-MM-dd"),
      numDiasAgenda: 0,
      pagador: {
        cpfCnpj: cleanCpfCnpj,
        tipoPessoa: isCpf ? "FISICA" : "JURIDICA",
        nome: (sacado.nome || "NAO INFORMADO").substring(0, 60),
        endereco: endereco.substring(0, 60),
        numero,
        complemento: (sacado.complemento || "").substring(0, 30),
        bairro: (sacado.bairro || "NAO INFORMADO").substring(0, 20),
        cidade: (sacado.municipio || "NAO INFORMADO").substring(0, 20),
        uf: sacado.uf || "SP",
        cep: (sacado.cep || "00000000").replace(/\D/g, ""),
        email: sacado.email || undefined,
        ddd,
        telefone,
      },
    };
  }

  throw new Error("Banco inválido.");
}

// Método POST principal (sem alterações)
export async function POST(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token) return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    const { duplicataId, banco, abatimento } = await request.json();
    
    console.log(`[EMISSÃO API] Recebido pedido para Duplicata ID: ${duplicataId}, Banco: ${banco}`);
    
    const dadosParaBoleto = await getDadosParaBoleto(duplicataId, banco, abatimento);
    
    console.log(`[EMISSÃO API] Dados para ${banco} preparados.`);

    let boletoGerado;
    let linhaDigitavelParaRetorno;
    let dadosParaSalvar; // Código de barras ou linha digitável

    if (banco === "safra") {
      const tokenData = await getSafraAccessToken();
      boletoGerado = await registrarBoletoSafra(tokenData.access_token, dadosParaBoleto);
      linhaDigitavelParaRetorno = boletoGerado.data?.documento?.linhaDigitavel || boletoGerado.data?.linhaDigitavel || "N/A";
      dadosParaSalvar = boletoGerado.data?.documento?.codigoBarras || boletoGerado.data?.codigoBarras || linhaDigitavelParaRetorno;
    
    } else if (banco === "bradesco") {
      const tokenData = await getBradescoAccessToken();
      boletoGerado = await registrarBoleto(tokenData.access_token, dadosParaBoleto);
      const bradescoPayload = boletoGerado?.data || boletoGerado || {};
      linhaDigitavelParaRetorno =
        bradescoPayload?.linhaDigitavel ||
        bradescoPayload?.linha_digitavel ||
        bradescoPayload?.linhaDigitable ||
        bradescoPayload?.titulo?.linhaDigitavel ||
        bradescoPayload?.titulo?.linha_digitavel ||
        bradescoPayload?.registro?.linhaDigitavel ||
        "N/A";
      dadosParaSalvar =
        bradescoPayload?.codigoBarras ||
        bradescoPayload?.codigo_barras ||
        bradescoPayload?.titulo?.codigoBarras ||
        bradescoPayload?.titulo?.codigo_barras ||
        bradescoPayload?.registro?.codigoBarras ||
        bradescoPayload?.nuTituloGerado ||
        linhaDigitavelParaRetorno;
    
    } else if (banco === "itau") {
      const tokenData = await getItauAccessToken();
      console.log("[EMISSÃO API] Token Itaú obtido. Registrando boleto...");
      boletoGerado = await registrarBoletoItau(tokenData.access_token, dadosParaBoleto);
      console.log("[EMISSÃO API] Resposta Itaú recebida.");

      // Validação da resposta do Itaú
      if (boletoGerado?.status_code && boletoGerado.status_code !== 201) {
          console.error("[EMISSÃO API ITAÚ ERRO] Resposta API:", JSON.stringify(boletoGerado));
          throw new Error(`Erro Itaú ${boletoGerado.status_code}: ${boletoGerado.mensagem || 'Erro desconhecido'}`);
      }
      if (!boletoGerado?.data?.dado_boleto?.dados_individuais_boleto?.[0]) {
          console.error("[EMISSÃO API ITAÚ ERRO] Resposta Inesperada:", JSON.stringify(boletoGerado));
          throw new Error("Resposta da API Itaú não contém dados do boleto esperado.");
      }

      const dadosIndividuais = boletoGerado.data.dado_boleto.dados_individuais_boleto[0];
      linhaDigitavelParaRetorno = dadosIndividuais.linha_digitavel || "N/A";
      dadosParaSalvar = dadosIndividuais.codigo_barras || linhaDigitavelParaRetorno;
      console.log(`[EMISSÃO API ITAÚ] Sucesso. Linha Digitável: ${linhaDigitavelParaRetorno}`);
    
    } else if (banco === "inter") {
      const tokenData = await getInterAccessToken();
      const contaCorrente = process.env.INTER_CONTA_CORRENTE;
      if (!contaCorrente) throw new Error("INTER_CONTA_CORRENTE não configurada.");

      console.log("[EMISSÃO API] Token Inter obtido. Emitindo cobrança...");
      const cobrancaEmitida = await emitirCobrancaInter(tokenData.access_token, contaCorrente, dadosParaBoleto);

      const codigoSolicitacao = cobrancaEmitida?.codigoSolicitacao;
      if (!codigoSolicitacao) {
        console.error("[EMISSÃO API INTER ERRO] Resposta sem codigoSolicitacao:", JSON.stringify(cobrancaEmitida));
        throw new Error("Resposta da API Inter não retornou codigoSolicitacao.");
      }

      // Consulta com retry curto para tentar obter a linha digitável/código de barras.
      let detalhesCobranca = null;
      const maxAttempts = 5;
      const delay = 2000;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          detalhesCobranca = await consultarCobrancaInter(tokenData.access_token, contaCorrente, codigoSolicitacao);
          if (detalhesCobranca?.boleto?.linhaDigitavel || detalhesCobranca?.boleto?.codigoBarras) {
            break;
          }
        } catch (err) {
          console.warn(`[EMISSÃO API INTER] Tentativa ${attempt} falhou: ${err.message}`);
        }
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      const linhaDigitavelInter = detalhesCobranca?.boleto?.linhaDigitavel;
      const codigoBarrasInter = detalhesCobranca?.boleto?.codigoBarras;
      linhaDigitavelParaRetorno = linhaDigitavelInter || "EM_PROCESSAMENTO";
      dadosParaSalvar = codigoBarrasInter || linhaDigitavelInter || null;

      // Salva também o codigoSolicitacao para uso do PDF
      dadosParaSalvar = dadosParaSalvar || null;
      console.log(`[EMISSÃO API INTER] CódigoSolicitação: ${codigoSolicitacao}`);

      const updatePayload = {
        banco_emissor_boleto: banco,
        valor_abatimento: abatimento || 0,
        codigo_solicitacao_inter: codigoSolicitacao,
      };
      if (dadosParaSalvar) {
        updatePayload.linha_digitavel = dadosParaSalvar;
      }

      // Salvar no Supabase (Inter: usa payload específico)
      console.log(`[EMISSÃO API] Atualizando duplicata ${duplicataId} no Supabase (Inter)...`);
      const { error: updateError } = await supabase
        .from("duplicatas")
        .update(updatePayload)
        .eq("id", duplicataId);

      if (updateError) {
        console.error(`[EMISSÃO API INTER ERRO DB] Falha ao salvar no Supabase: ${updateError.message}`);

        // Fallback: tenta salvar sem o campo codigo_solicitacao_inter (caso a coluna não exista).
        const fallbackPayload = {
          banco_emissor_boleto: banco,
          valor_abatimento: abatimento || 0,
        };
        if (dadosParaSalvar) {
          fallbackPayload.linha_digitavel = dadosParaSalvar;
        }

        const { error: fallbackError } = await supabase
          .from("duplicatas")
          .update(fallbackPayload)
          .eq("id", duplicataId);

        return NextResponse.json({
          success: true,
          linhaDigitavel: linhaDigitavelParaRetorno,
          codigoSolicitacao,
          warning: fallbackError
            ? "Cobrança emitida, mas falha ao salvar no banco."
            : "Cobrança emitida, mas a coluna codigo_solicitacao_inter não foi salva.",
        });
      }

      console.log(`[EMISSÃO API INTER] Sucesso total para duplicata ${duplicataId}.`);
      return NextResponse.json({
        success: true,
        linhaDigitavel: linhaDigitavelParaRetorno,
        codigoSolicitacao,
      });
    
    } else {
      throw new Error("Banco selecionado inválido.");
    }

    // Salvar no Supabase
    console.log(`[EMISSÃO API] Atualizando duplicata ${duplicataId} no Supabase...`);
    const { error: updateError } = await supabase
      .from("duplicatas")
      .update({
        linha_digitavel: dadosParaSalvar, // Salva o código de barras
        banco_emissor_boleto: banco,
        valor_abatimento: abatimento || 0,
      })
      .eq("id", duplicataId);

    if (updateError) {
      console.error(`[EMISSÃO API ERRO DB] Falha ao salvar no Supabase: ${updateError.message}`);
      return NextResponse.json({
        success: true,
        linhaDigitavel: linhaDigitavelParaRetorno,
        warning: "Boleto emitido, mas falha ao salvar no banco.",
      });
    }

    console.log(`[EMISSÃO API] Sucesso total para duplicata ${duplicataId}.`);
    return NextResponse.json({
      success: true,
      linhaDigitavel: linhaDigitavelParaRetorno,
    });

  } catch (error) {
    console.error(`[ERRO FATAL EMISSÃO API] ${error.message}`, error.stack);
    // Tenta extrair mensagens de erro da API do banco
    const apiErrorMessage = error.response?.data?.mensagem || error.response?.data?.message || error.message;
    return NextResponse.json({ message: apiErrorMessage }, { status: 500 });
  }
}


