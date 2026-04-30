import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import { format } from "date-fns";
import { getSafraAccessToken, registrarBoletoSafra } from "@/app/lib/safraService";
import { getBradescoAccessToken, registrarBoleto } from "@/app/lib/bradescoService";
import { getItauAccessToken, registrarBoletoItau } from "@/app/lib/itauService";
import {
  getInterAccessToken,
  emitirCobrancaInter,
  consultarCobrancaInter,
} from "@/app/lib/interService";

const bancosPermitidos = new Set(["itau", "safra", "bradesco", "inter"]);
const onlyDigits = (value) => String(value || "").replace(/\D/g, "");
const toStringSafe = (value) => String(value ?? "");
const toMoneyString = (value) => (Number(value) || 0).toFixed(2);
const toMoney = (value) => Number((Number(value) || 0).toFixed(2));
const todayIso = () => format(new Date(), "yyyy-MM-dd");
const dateAtNoon = (dateString) => new Date(`${dateString}T12:00:00Z`);
const toDateBradesco = (dateString) => format(dateAtNoon(dateString), "dd.MM.yyyy");
const isBradescoSandbox = () => {
  const base = String(process.env.BRADESCO_API_BASE_URL || process.env.BRADESCO_BASE_URL || "").toLowerCase();
  return base.includes("sandbox") || base.includes("prebanco");
};

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

const buildBradescoNegociacao = (agencia, conta) => {
  const agenciaDigits = onlyDigits(agencia).padStart(4, "0").slice(-4);
  const contaDigits = onlyDigits(conta).padStart(7, "0").slice(-7);
  return `${agenciaDigits}${"0".repeat(7)}${contaDigits}`;
};

const makeNossoNumero = (id, banco) => {
  const widthByBanco = { itau: 8, safra: 9, bradesco: 11, inter: 15 };
  const width = widthByBanco[banco] || 9;
  return String(id).replace(/\D/g, "").padStart(width, "0").slice(-width);
};

const cleanSeuNumero = (value, fallback) => {
  const cleaned = String(value || fallback || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "");
  return cleaned || String(fallback || Date.now());
};

const parseEndereco = (enderecoRaw) => {
  const endereco = String(enderecoRaw || "NAO INFORMADO").trim();
  if (!endereco.includes(",")) return { logradouro: endereco, numero: "0" };

  const [logradouro, ...rest] = endereco.split(",");
  return {
    logradouro: (logradouro || endereco).trim(),
    numero: (rest.join(",").replace(/[^\d]/g, "").slice(0, 10) || "0"),
  };
};

const validatePayload = ({ banco, sacadoId, vencimento, valor, seuNumero, descricao, abatimento }) => {
  if (!bancosPermitidos.has(banco)) throw new Error("Banco selecionado invalido.");
  if (!sacadoId) throw new Error("Sacado obrigatorio.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(vencimento || ""))) throw new Error("Vencimento invalido.");
  if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) throw new Error("Valor invalido.");
  if (!Number.isFinite(Number(abatimento || 0)) || Number(abatimento || 0) < 0) throw new Error("Abatimento invalido.");
  if (Number(abatimento || 0) >= Number(valor)) throw new Error("Abatimento deve ser menor que o valor.");
  if (!String(seuNumero || "").trim()) throw new Error("Seu numero/referencia obrigatorio.");
  if (!String(descricao || "").trim()) throw new Error("Descricao obrigatoria.");
};

const buildSafraPayload = ({ sacado, vencimento, valorFinal, abatimento, nossoNumero, seuNumero }) => ({
  agencia: process.env.SAFRA_AGENCIA,
  conta: process.env.SAFRA_CONTA,
  documento: {
    numero: nossoNumero,
    numeroCliente: cleanSeuNumero(seuNumero, nossoNumero).slice(0, 10),
    especie: "02",
    dataVencimento: format(dateAtNoon(vencimento), "yyyy-MM-dd"),
    valor: toMoney(valorFinal),
    quantidadeDiasProtesto: 5,
    valorAbatimento: toMoney(abatimento),
    pagador: {
      nome: String(sacado.nome || "NAO INFORMADO").replace(/\.$/, "").substring(0, 40),
      tipoPessoa: onlyDigits(sacado.cnpj).length > 11 ? "J" : "F",
      numeroDocumento: onlyDigits(sacado.cnpj),
      endereco: {
        logradouro: String(sacado.endereco || "NAO INFORMADO").substring(0, 40),
        bairro: String(sacado.bairro || "NAO INFORMADO").substring(0, 10),
        cidade: String(sacado.municipio || "NAO INFORMADO").substring(0, 15),
        uf: sacado.uf || "SP",
        cep: onlyDigits(sacado.cep || "00000000"),
      },
    },
  },
});

const buildItauPayload = ({ sacado, vencimento, valorFinal, nossoNumero, seuNumero }) => {
  const documento = onlyDigits(sacado.cnpj);
  const isCpf = documento.length === 11;
  const valorFormatado = Math.round(valorFinal * 100).toString().padStart(15, "0");

  return {
    data: {
      etapa_processo_boleto: "Efetivacao",
      codigo_canal_operacao: "API",
      beneficiario: { id_beneficiario: process.env.ITAU_ID_BENEFICIARIO },
      dado_boleto: {
        descricao_instrumento_cobranca: "boleto",
        tipo_boleto: "a vista",
        codigo_carteira: process.env.ITAU_BOLETO_CARTEIRA || "109",
        codigo_especie: "02",
        valor_total_titulo: valorFormatado,
        valor_abatimento: "0",
        data_emissao: todayIso(),
        pagador: {
          pessoa: {
            nome_pessoa: String(sacado.nome || "NAO INFORMADO").substring(0, 50),
            tipo_pessoa: {
              codigo_tipo_pessoa: isCpf ? "F" : "J",
              [isCpf ? "numero_cadastro_pessoa_fisica" : "numero_cadastro_nacional_pessoa_juridica"]: documento,
            },
          },
          endereco: {
            nome_logradouro: String(sacado.endereco || "NAO INFORMADO").substring(0, 45),
            nome_bairro: String(sacado.bairro || "NAO INFORMADO").substring(0, 15),
            nome_cidade: String(sacado.municipio || "NAO INFORMADO").substring(0, 20),
            sigla_UF: sacado.uf || "SP",
            numero_CEP: onlyDigits(sacado.cep || "00000000"),
          },
        },
        dados_individuais_boleto: [
          {
            numero_nosso_numero: nossoNumero,
            data_vencimento: format(dateAtNoon(vencimento), "yyyy-MM-dd"),
            valor_titulo: valorFormatado,
            texto_seu_numero: String(seuNumero).slice(0, 25),
          },
        ],
        multa: { codigo_tipo_multa: "0", percentual_multa: "00000000000" },
        juros: { codigo_tipo_juros: "0", percentual_juros: "00000000000" },
        recebimento_divergente: { codigo_tipo_autorizacao: "03" },
        desconto_expresso: false,
      },
    },
  };
};

const buildBradescoPayload = ({ sacado, vencimento, valorFinal, abatimento, nossoNumero, seuNumero, descricao }) => {
  const pagadorDoc = onlyDigits(sacado.cnpj);
  if (!pagadorDoc) throw new Error(`Sacado ${sacado.id} sem CPF/CNPJ para emissao Bradesco.`);

  const isCpfPagador = pagadorDoc.length <= 11;
  const cepDigits = onlyDigits(sacado.cep).padStart(8, "0").slice(-8);
  const { logradouro, numero } = parseEndereco(sacado.endereco);
  const nuCpfCnpjBeneficiario = onlyDigits(process.env.BRADESCO_CPFCNPJ_RAIZ);
  const filialCpfCnpjBeneficiario = onlyDigits(process.env.BRADESCO_FILIAL_CNPJ);
  const ctrlCpfCnpjBeneficiario = onlyDigits(process.env.BRADESCO_CTRL_CNPJ);
  const nuNegociacao =
    buildBradescoNegociacao(process.env.BRADESCO_AGENCIA, process.env.BRADESCO_CONTA) ||
    onlyDigits(process.env.BRADESCO_NU_NEGOCIACAO);

  if (!nuCpfCnpjBeneficiario || !filialCpfCnpjBeneficiario || !ctrlCpfCnpjBeneficiario || !nuNegociacao) {
    throw new Error("Configuracao Bradesco incompleta para emissao de boleto.");
  }

  const mensagem = toUpperAscii(descricao || `REFERENCIA ${seuNumero}`).slice(0, 80);
  const payloadBase = {
    codigoUsuarioSolicitante: toUpperAscii(process.env.BRADESCO_CODIGO_USUARIO || "APISERVIC").replace(/[^A-Z0-9]/g, "").slice(0, 9) || "APISERVIC",
    debitoAutomatico: toStringSafe(process.env.BRADESCO_DEBITO_AUTOMATICO || "N"),
    nuCPFCNPJ: toStringSafe(nuCpfCnpjBeneficiario),
    filialCPFCNPJ: toStringSafe(filialCpfCnpjBeneficiario),
    ctrlCPFCNPJ: toStringSafe(ctrlCpfCnpjBeneficiario),
    idProduto: toStringSafe(process.env.BRADESCO_ID_PRODUTO || 9),
    nuNegociacao: toStringSafe(nuNegociacao),
    nuTitulo: toStringSafe(nossoNumero),
    nuCliente: cleanSeuNumero(seuNumero, nossoNumero).slice(0, 25),
    dtEmissaoTitulo: toDateBradesco(todayIso()),
    dtVencimentoTitulo: toDateBradesco(vencimento),
    indicadorMoeda: "1",
    vlNominalTitulo: toMoneyString(valorFinal),
    cdEspecieTitulo: toStringSafe(process.env.BRADESCO_CD_ESPECIE_TITULO || 2),
    tpProtestoAutomaticoNegativacao: "0",
    prazoProtestoAutomaticoNegativacao: "0",
    controleParticipante: "",
    cdPagamentoParcial: "N",
    qtdePagamentoParcial: "0",
    tipoPrazoDecursoTres: toStringSafe(process.env.BRADESCO_TIPO_PRAZO_DECURSO_TRES || 0),
    percentualJuros: "0.00",
    vlJuros: "0.00",
    qtdeDiasJuros: "0",
    percentualMulta: "0.00",
    vlMulta: "0.00",
    qtdeDiasMulta: "0",
    vlAbatimento: toMoneyString(abatimento),
    vlIOF: "0.00",
    nomePagador: toUpperAscii(sacado.nome || "NAO INFORMADO").slice(0, 70),
    logradouroPagador: toUpperAscii(logradouro, "NAO INFORMADO").slice(0, 100),
    nuLogradouroPagador: numero,
    complementoLogradouroPagador: toUpperAscii(sacado.complemento || "").slice(0, 30),
    tpVencimento: "0",
    cepPagador: toStringSafe(Number(cepDigits.slice(0, 5))),
    complementoCepPagador: toStringSafe(Number(cepDigits.slice(5))),
    bairroPagador: toUpperAscii(toBradescoAlnum(sacado.bairro, "CENTRO")).slice(0, 40),
    municipioPagador: toUpperAscii(sacado.municipio || "NAO INFORMADO").slice(0, 50),
    ufPagador: String(sacado.uf || "SP").slice(0, 2).toUpperCase(),
    cdIndCpfcnpjPagador: toStringSafe(isCpfPagador ? 1 : 2),
    nuCpfcnpjPagador: toStringSafe(pagadorDoc),
    cindcdAceitSacdo: "N",
    listaMsgs: [{ mensagem }],
  };

  if (sacado.email) payloadBase.endEletronicoPagador = String(sacado.email).slice(0, 100);

  if (!isBradescoSandbox()) return payloadBase;

  return {
    ...payloadBase,
    debitoAutomatico: "S",
    nuCPFCNPJ: Number(nuCpfCnpjBeneficiario),
    filialCPFCNPJ: Number(filialCpfCnpjBeneficiario),
    ctrlCPFCNPJ: Number(ctrlCpfCnpjBeneficiario),
    idProduto: Number(process.env.BRADESCO_ID_PRODUTO || 9),
    nuNegociacao: Number(nuNegociacao),
    nuTitulo: 0,
    nuCliente: ".",
    indicadorMoeda: 1,
    cdEspecieTitulo: Number(process.env.BRADESCO_CD_ESPECIE_TITULO || 1),
    tpProtestoAutomaticoNegativacao: 0,
    prazoProtestoAutomaticoNegativacao: 0,
    qtdePagamentoParcial: 0,
    tipoPrazoDecursoTres: 1,
    percentualJuros: 0,
    vlJuros: 0,
    qtdeDiasJuros: 0,
    percentualMulta: 0,
    vlMulta: 0,
    qtdeDiasMulta: 0,
    vlIOF: 0,
    cepPagador: Number(cepDigits.slice(0, 5)),
    complementoCepPagador: Number(cepDigits.slice(5)),
    cdIndCpfcnpjPagador: isCpfPagador ? 1 : 2,
    nuCpfcnpjPagador: Number(pagadorDoc),
    dddFoneSacado: 0,
    foneSacado: 0,
    bancoDoDebAutomatico: Number(process.env.BRADESCO_BANCO_DEBITO_AUTOMATICO || 237),
    agenciaDoDebAutomatico: Number(process.env.BRADESCO_AGENCIA || 0),
    digitoAgenciaDoDebAutomat: Number(process.env.BRADESCO_AGENCIA_DV || 0),
    contaDoDebAutomatico: Number(process.env.BRADESCO_CONTA || 0),
    razaoDoDebAutomatico: Number(process.env.BRADESCO_RAZAO_DEBITO_AUTOMATICO || 705),
    codBancoDoProtesto: 0,
    listaMsgs_1_mensagem: mensagem,
  };
};

const buildInterPayload = ({ sacado, vencimento, valorFinal, seuNumero }) => {
  const documento = onlyDigits(sacado.cnpj);
  const isCpf = documento.length === 11;
  const { logradouro, numero } = parseEndereco(sacado.endereco);
  const telefoneRaw = onlyDigits(sacado.fone);

  return {
    seuNumero: cleanSeuNumero(seuNumero).slice(-15),
    valorNominal: toMoney(valorFinal),
    dataVencimento: format(dateAtNoon(vencimento), "yyyy-MM-dd"),
    numDiasAgenda: 0,
    pagador: {
      cpfCnpj: documento,
      tipoPessoa: isCpf ? "FISICA" : "JURIDICA",
      nome: String(sacado.nome || "NAO INFORMADO").substring(0, 60),
      endereco: logradouro.substring(0, 60),
      numero,
      complemento: String(sacado.complemento || "").substring(0, 30),
      bairro: String(sacado.bairro || "NAO INFORMADO").substring(0, 20),
      cidade: String(sacado.municipio || "NAO INFORMADO").substring(0, 20),
      uf: sacado.uf || "SP",
      cep: onlyDigits(sacado.cep || "00000000"),
      email: sacado.email || undefined,
      ddd: telefoneRaw.length >= 10 ? telefoneRaw.substring(0, 2) : undefined,
      telefone: telefoneRaw.length >= 10 ? telefoneRaw.substring(2) : undefined,
    },
  };
};

const extractBradesco = (boletoGerado) => {
  const data = boletoGerado?.data || boletoGerado || {};
  return {
    linhaDigitavel:
      data?.linhaDig10 ||
      data?.linha_digitavel10 ||
      data?.linhaDigitavel ||
      data?.linha_digitavel ||
      data?.linhaDigitable ||
      data?.titulo?.linhaDigitavel ||
      data?.titulo?.linha_digitavel ||
      data?.registro?.linhaDigitavel ||
      null,
    codigoBarras:
      data?.codBarras10 ||
      data?.codigoBarras10 ||
      data?.codigo_barras10 ||
      data?.codigoBarras ||
      data?.codigo_barras ||
      data?.titulo?.codigoBarras ||
      data?.titulo?.codigo_barras ||
      data?.registro?.codigoBarras ||
      null,
  };
};

const emitirNoBanco = async ({ banco, dadosBoleto }) => {
  if (banco === "safra") {
    const tokenData = await getSafraAccessToken();
    const boletoGerado = await registrarBoletoSafra(tokenData.access_token, dadosBoleto);
    return {
      boletoGerado,
      linhaDigitavel: boletoGerado.data?.documento?.linhaDigitavel || boletoGerado.data?.linhaDigitavel || null,
      codigoBarras: boletoGerado.data?.documento?.codigoBarras || boletoGerado.data?.codigoBarras || null,
    };
  }

  if (banco === "bradesco") {
    const tokenData = await getBradescoAccessToken();
    const boletoGerado = await registrarBoleto(tokenData.access_token, dadosBoleto);
    const extracted = extractBradesco(boletoGerado);
    return { boletoGerado, ...extracted };
  }

  if (banco === "itau") {
    const tokenData = await getItauAccessToken();
    const boletoGerado = await registrarBoletoItau(tokenData.access_token, dadosBoleto);
    if (boletoGerado?.status_code && boletoGerado.status_code !== 201) {
      throw new Error(`Erro Itau ${boletoGerado.status_code}: ${boletoGerado.mensagem || "Erro desconhecido"}`);
    }

    const dadosIndividuais = boletoGerado?.data?.dado_boleto?.dados_individuais_boleto?.[0];
    if (!dadosIndividuais) throw new Error("Resposta da API Itau nao contem dados do boleto esperado.");

    return {
      boletoGerado,
      linhaDigitavel: dadosIndividuais.linha_digitavel || null,
      codigoBarras: dadosIndividuais.codigo_barras || null,
      nossoNumero: dadosIndividuais.numero_nosso_numero || null,
    };
  }

  if (banco === "inter") {
    const tokenData = await getInterAccessToken();
    const contaCorrente = process.env.INTER_CONTA_CORRENTE;
    if (!contaCorrente) throw new Error("INTER_CONTA_CORRENTE nao configurada.");

    const cobrancaEmitida = await emitirCobrancaInter(tokenData.access_token, contaCorrente, dadosBoleto);
    const codigoSolicitacao = cobrancaEmitida?.codigoSolicitacao;
    if (!codigoSolicitacao) throw new Error("Resposta da API Inter nao retornou codigoSolicitacao.");

    let detalhesCobranca = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        detalhesCobranca = await consultarCobrancaInter(tokenData.access_token, contaCorrente, codigoSolicitacao);
        if (detalhesCobranca?.boleto?.linhaDigitavel || detalhesCobranca?.boleto?.codigoBarras) break;
      } catch (error) {
        console.warn(`[EMISSAO MANUAL INTER] Tentativa ${attempt} falhou: ${error.message}`);
      }
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return {
      boletoGerado: { cobrancaEmitida, detalhesCobranca },
      linhaDigitavel: detalhesCobranca?.boleto?.linhaDigitavel || "EM_PROCESSAMENTO",
      codigoBarras: detalhesCobranca?.boleto?.codigoBarras || null,
      nossoNumero: codigoSolicitacao,
      codigoSolicitacao,
    };
  }

  throw new Error("Banco selecionado invalido.");
};

export async function POST(request) {
  let boletoManualId = null;

  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token) return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    const body = await request.json();
    const banco = String(body.banco || "").toLowerCase();
    const payload = {
      banco,
      sacadoId: body.sacadoId,
      vencimento: body.vencimento,
      valor: Number(body.valor),
      seuNumero: String(body.seuNumero || "").trim(),
      descricao: String(body.descricao || "").trim(),
      abatimento: Number(body.abatimento || 0),
    };

    validatePayload(payload);

    const { data: sacado, error: sacadoError } = await supabase
      .from("sacados")
      .select("*")
      .eq("id", payload.sacadoId)
      .single();

    if (sacadoError || !sacado) throw new Error("Sacado nao encontrado.");

    const valorFinal = Number((payload.valor - payload.abatimento).toFixed(2));
    const { data: boletoCriado, error: insertError } = await supabase
      .from("boletos_manuais")
      .insert({
        banco: payload.banco,
        sacado_id: payload.sacadoId,
        valor: payload.valor,
        abatimento: payload.abatimento,
        vencimento: payload.vencimento,
        descricao: payload.descricao,
        seu_numero: payload.seuNumero,
        status: "processando",
      })
      .select("id")
      .single();

    if (insertError || !boletoCriado) throw new Error(insertError?.message || "Falha ao salvar boleto manual.");

    boletoManualId = boletoCriado.id;
    const nossoNumero = makeNossoNumero(boletoManualId, payload.banco);

    const common = {
      sacado,
      vencimento: payload.vencimento,
      valorFinal,
      abatimento: payload.abatimento,
      nossoNumero,
      seuNumero: payload.seuNumero,
      descricao: payload.descricao,
    };

    const dadosBoleto =
      payload.banco === "safra"
        ? buildSafraPayload(common)
        : payload.banco === "bradesco"
          ? buildBradescoPayload(common)
          : payload.banco === "itau"
            ? buildItauPayload(common)
            : buildInterPayload(common);

    const resultadoBanco = await emitirNoBanco({ banco: payload.banco, dadosBoleto });
    const linhaDigitavel = resultadoBanco.linhaDigitavel || null;
    const codigoBarras = resultadoBanco.codigoBarras || null;
    const nossoNumeroFinal = resultadoBanco.nossoNumero || nossoNumero;

    const { error: updateError } = await supabase
      .from("boletos_manuais")
      .update({
        linha_digitavel: linhaDigitavel,
        codigo_barras: codigoBarras,
        nosso_numero: nossoNumeroFinal,
        status: "emitido",
        resposta_banco: resultadoBanco.boletoGerado,
      })
      .eq("id", boletoManualId);

    if (updateError) {
      return NextResponse.json({
        success: true,
        id: boletoManualId,
        linhaDigitavel,
        codigoBarras,
        nossoNumero: nossoNumeroFinal,
        pdfUrl: null,
        warning: "Boleto emitido, mas falha ao atualizar o registro salvo.",
      });
    }

    return NextResponse.json({
      success: true,
      id: boletoManualId,
      linhaDigitavel,
      codigoBarras,
      nossoNumero: nossoNumeroFinal,
      pdfUrl: null,
    });
  } catch (error) {
    console.error(`[ERRO EMISSAO MANUAL] ${error.message}`, error.stack);

    if (boletoManualId) {
      await supabase
        .from("boletos_manuais")
        .update({
          status: "erro",
          resposta_banco: { message: error.message, response: error.response?.data || null },
        })
        .eq("id", boletoManualId);
    }

    const apiErrorMessage = error.response?.data?.mensagem || error.response?.data?.message || error.message;
    return NextResponse.json({ success: false, message: apiErrorMessage }, { status: 500 });
  }
}
