import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import { gerarPdfBoletoBradesco } from "@/app/lib/bradescoPdfService";
import { consultarBoletoBradesco, getBradescoAccessToken } from "@/app/lib/bradescoService";

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");
const buildContaProduto = (agencia, conta) => {
  const agenciaDigits = onlyDigits(agencia).padStart(4, "0").slice(-4);
  const contaDigits = onlyDigits(conta).padStart(7, "0").slice(-7);
  return Number(`${agenciaDigits}${contaDigits}`);
};
const isValidLinhaOuCodigo = (value) => {
  const digits = onlyDigits(value);
  return digits.length === 44 || digits.length === 47;
};

async function consultarSegundaViaBradesco(duplicata) {
  const tokenData = await getBradescoAccessToken();
  const payloadConsulta = {
    cpfCnpjUsuario: Number(onlyDigits(process.env.BRADESCO_CPFCNPJ_RAIZ)),
    filialCnpjUsuario: Number(onlyDigits(process.env.BRADESCO_FILIAL_CNPJ)),
    controleCpfCnpjUsuario: Number(onlyDigits(process.env.BRADESCO_CTRL_CNPJ)),
    idProduto: Number(onlyDigits(process.env.BRADESCO_ID_PRODUTO || 9)),
    contaProduto: buildContaProduto(process.env.BRADESCO_AGENCIA, process.env.BRADESCO_CONTA),
    nomePersonalizado: "",
    nossoNumero: Number(String(duplicata.id).padStart(11, "0")),
    seqTitulo: 0,
    status: 0,
  };

  const consulta = await consultarBoletoBradesco(tokenData.access_token, payloadConsulta);
  const linhaDigitavel =
    consulta?.linhaDig10 ||
    consulta?.linhaDig ||
    consulta?.linha_digitavel ||
    consulta?.linhaDigitavel ||
    "";
  const codigoBarras =
    consulta?.codBarras10 ||
    consulta?.codBarras ||
    consulta?.codigoBarras ||
    consulta?.codigo_barras ||
    "";

  return {
    ...consulta,
    linhaDigitavel,
    codigoBarras,
  };
}

export async function GET(request, { params }) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token) return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    const { id: operacaoId } = await params;
    if (!operacaoId) {
      return NextResponse.json({ message: "ID da Operação é obrigatório." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");
    const ids = idsParam ? idsParam.split(",").filter(Boolean) : [];

    let query = supabase
      .from("duplicatas")
      .select("*, operacao:operacoes!inner(cliente:clientes!inner(*), tipo_operacao:tipos_operacao(*))")
      .eq("operacao_id", operacaoId);

    if (ids.length > 0) {
      query = query.in("id", ids);
    }

    query = query.order("data_vencimento", { ascending: true }).order("nf_cte", { ascending: true });

    const { data: duplicatas, error: dupError } = await query;
    if (dupError) throw new Error(`Falha ao consultar duplicatas: ${dupError.message}`);
    if (!duplicatas || duplicatas.length === 0) {
      throw new Error(`Nenhuma duplicata encontrada para a operação #${operacaoId}.`);
    }

    const listaBoletos = [];
    for (const duplicata of duplicatas) {
      if (!duplicata.operacao?.cliente || !duplicata.sacado_id) {
        console.warn(
          `[AVISO PDF BRADESCO] Duplicata ${duplicata.id} pulada (dados incompletos).`
        );
        continue;
      }

      const { data: sacado, error: sacadoErr } = await supabase
        .from("sacados")
        .select("*")
        .eq("id", duplicata.sacado_id)
        .single();

      if (sacadoErr || !sacado) {
        console.warn(
          `[AVISO PDF BRADESCO] Sacado ID ${duplicata.sacado_id} não encontrado. Pulando duplicata ${duplicata.id}.`
        );
        continue;
      }

      let dadosBradesco = {
        linhaDigitavel: duplicata.linha_digitavel || "",
        codigoBarras: "",
      };

      if (!isValidLinhaOuCodigo(dadosBradesco.linhaDigitavel)) {
        try {
          const consulta = await consultarSegundaViaBradesco(duplicata);
          if (isValidLinhaOuCodigo(consulta.linhaDigitavel || consulta.codigoBarras)) {
            dadosBradesco = consulta;
            const valorParaSalvar = consulta.linhaDigitavel || consulta.codigoBarras || "";
            if (valorParaSalvar) {
              await supabase
                .from("duplicatas")
                .update({ linha_digitavel: valorParaSalvar })
                .eq("id", duplicata.id);
            }
          }
        } catch (consultaError) {
          console.warn(
            `[AVISO PDF BRADESCO] Falha ao consultar 2a via oficial da duplicata ${duplicata.id}: ${consultaError.message}`
          );
        }
      }

      if (!isValidLinhaOuCodigo(dadosBradesco.linhaDigitavel || dadosBradesco.codigoBarras)) {
        console.warn(
          `[AVISO PDF BRADESCO] Duplicata ${duplicata.id} sem linha digitavel/codigo de barras validos mesmo apos consulta.`
        );
      }

      listaBoletos.push({
        ...duplicata,
        cedente: duplicata.operacao.cliente,
        sacado,
        linhaDigitavel: dadosBradesco.linhaDigitavel || duplicata.linha_digitavel || "",
        codigoBarras: dadosBradesco.codigoBarras || "",
        nomeBeneficiario: dadosBradesco.nomeBeneficiario || duplicata.operacao.cliente.nome,
        logradouroBeneficiario:
          dadosBradesco.logradouroBeneficiario ||
          dadosBradesco.endCedente10 ||
          duplicata.operacao.cliente.endereco,
        enderecoBeneficiarioComplementar:
          dadosBradesco.enderecoBeneficiarioComplementar ||
          `${duplicata.operacao.cliente.cep || ""} - ${duplicata.operacao.cliente.municipio || ""} - ${duplicata.operacao.cliente.uf || ""}`,
        nuTituloGerado: dadosBradesco.nuTituloGerado || duplicata.id,
        nuCliente: dadosBradesco.snumero10 || duplicata.nf_cte,
        especieSigla: dadosBradesco.especDocto10 || "DM",
      });
    }

    if (listaBoletos.length === 0) {
      throw new Error(
        "Nenhum boleto válido para gerar PDF nesta operação. Reemita o título após o ajuste se ele tiver sido salvo sem linha digitável/código de barras."
      );
    }

    const pdfBuffer = await gerarPdfBoletoBradesco(listaBoletos);

    const tipoDocumento =
      duplicatas[0]?.operacao?.cliente?.ramo_de_atividade === "Transportes" ? "CTe" : "NF";
    const numerosDocumento = [...new Set(duplicatas.map((d) => String(d.nf_cte).split(".")[0]))].join("_");
    const filename = `Boletos_Bradesco_${tipoDocumento}_${numerosDocumento}.pdf`;

    const headers = new Headers();
    headers.append("Content-Type", "application/pdf");
    headers.append("Content-Disposition", `attachment; filename="${filename}"`);

    return new Response(pdfBuffer, { headers });
  } catch (error) {
    console.error("[ERRO PDF BRADESCO]", error);
    return NextResponse.json({ message: error.message || "Erro ao gerar PDF do Bradesco." }, { status: 500 });
  }
}
