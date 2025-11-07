"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import AdicionarNotaFiscalForm from "@/app/components/AdicionarNotaFiscalForm";
import OperacaoDetalhes from "@/app/components/OperacaoDetalhes";
import OperacaoHeader from "@/app/components/OperacaoHeader";
import Notification from "@/app/components/Notification";
import DescontoModal from "@/app/components/DescontoModal";
import EditClienteModal from "@/app/components/EditClienteModal";
import EditSacadoModal from "@/app/components/EditSacadoModal";
import EmailModal from "@/app/components/EmailModal";
import PartialDebitModal from "@/app/components/PartialDebitModal";
import PixConfirmationModal from "@/app/components/PixConfirmationModal";
import PixReceiptModal from "@/app/components/PixReceiptModal";
import RecompraModal from "@/app/components/RecompraModal";
import { formatBRLInput, parseBRL, formatDisplayConta } from "@/app/utils/formatters";

export default function OperacaoBorderoPage() {
  const [dataOperacao, setDataOperacao] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [tipoOperacaoId, setTipoOperacaoId] = useState("");
  const [empresaCedente, setEmpresaCedente] = useState("");
  const [empresaCedenteId, setEmpresaCedenteId] = useState(null);
  const [cedenteRamo, setCedenteRamo] = useState("");
  const [cedenteSelecionado, setCedenteSelecionado] = useState(null);
  const [novaNf, setNovaNf] = useState({
    nfCte: "",
    dataNf: "",
    valorNf: "",
    clienteSacado: "",
    parcelas: "1",
    prazos: "",
    peso: "",
  });
  const [sacadoSelecionado, setSacadoSelecionado] = useState(null);
  const [notasFiscais, setNotasFiscais] = useState([]);
  const [descontos, setDescontos] = useState([]);
  const [contasBancarias, setContasBancarias] = useState([]);
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [isDescontoModalOpen, setIsDescontoModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState({ message: "", type: "" });
  const [tiposOperacao, setTiposOperacao] = useState([]);
  const [condicoesSacado, setCondicoesSacado] = useState([]);
  const [ignoreDespesasBancarias, setIgnoreDespesasBancarias] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [savedOperacaoInfo, setSavedOperacaoInfo] = useState(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [jurosPre, setjurosPre] = useState(true);
  const [isPartialDebit, setIsPartialDebit] = useState(false);
  const [isPartialDebitModalOpen, setIsPartialDebitModalOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [xmlDataPendente, setXmlDataPendente] = useState(null);
  const [isClienteModalOpen, setIsClienteModalOpen] = useState(false);
  const [isSacadoModalOpen, setIsSacadoModalOpen] = useState(false);
  const [clienteParaCriar, setClienteParaCriar] = useState(null);
  const [sacadoParaCriar, setSacadoParaCriar] = useState(null);
  const [isPagarComPix, setIsPagarComPix] = useState(false);
  const [pixData, setPixData] = useState({ tipo_chave_pix: 'CPF/CNPJ', chave: '' });
  const [isPixConfirmOpen, setIsPixConfirmOpen] = useState(false);
  const [pixPayload, setPixPayload] = useState(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [isRecompraModalOpen, setIsRecompraModalOpen] = useState(false);
  const [valorParcialPendente, setValorParcialPendente] = useState(null);
  const [dataParcialPendente, setDataParcialPendente] = useState(null);

  // --- 1. PRIMEIRA ALTERAÇÃO: MUDAR STATE DO PAGADOR ---
  // State antigo: const [clienteMasterNome, setClienteMasterNome] = useState("");
  const [clienteMasterInfo, setClienteMasterInfo] = useState({ nome: "", cnpj: "" });

  const getAuthHeader = () => {
    const token = sessionStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: "", type: "" }), 5000);
  };

  const fetchApiData = async (url) => {
    try {
      const res = await fetch(url, { headers: getAuthHeader() });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      const [tiposData, contasData, clientesData] = await Promise.all([
        fetchApiData(`/api/cadastros/tipos-operacao`),
        fetchApiData(`/api/cadastros/contas/master`),
        fetchApiData('/api/cadastros/clientes')
      ]);
      const formattedTipos = tiposData.map((t) => ({
        ...t,
        taxaJuros: t.taxa_juros,
        valorFixo: t.valor_fixo,
        despesasBancarias: t.despesas_bancarias,
        usarPrazoSacado: t.usar_prazo_sacado,
        usarPesoNoValorFixo: t.usar_peso_no_valor_fixo,
      }));
      const formattedContas = contasData.map((c) => ({
        ...c,
        contaCorrente: c.conta_corrente,
      }));

      setTiposOperacao(formattedTipos);
      setContasBancarias(formattedContas);
      if (formattedContas.length > 0) setContaBancariaId(formattedContas[0].id);

      const masterClientId = parseInt(process.env.NEXT_PUBLIC_MASTER_CLIENT_ID, 10);
      let clientePagador;
      if (masterClientId) {
          clientePagador = clientesData.find(c => c.id === masterClientId);
      }
      
      // --- 2. SEGUNDA ALTERAÇÃO: PREENCHER O OBJETO COMPLETO DO PAGADOR ---
      if (clientePagador) {
        setClienteMasterInfo({ nome: clientePagador.nome, cnpj: clientePagador.cnpj });
      } else if (clientesData.length > 0) {
        setClienteMasterInfo({ nome: clientesData[0].nome, cnpj: clientesData[0].cnpj });
      }
    };
    fetchInitialData();
  }, []);

  const fetchClientes = (query) =>
    fetchApiData(`/api/cadastros/clientes/search?nome=${query}`);
  const fetchSacados = (query) =>
    fetchApiData(`/api/cadastros/sacados/search?nome=${query}`);

  // ... (demais funções handleXmlUpload, preencherFormularioComXml, etc. permanecem iguais)
  const handleXmlUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    showNotification("Processando XML...", "info");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch(`/api/upload/nfe-xml`, {
        method: "POST",
        headers: { ...getAuthHeader() },
        body: formData,
      });
      if (!response.ok) {
        const errorText = await response.json();
        throw new Error(errorText.message || "Falha ao ler o ficheiro XML.");
      }
      const data = await response.json();
      setXmlDataPendente(data);
      if (!data.emitenteExiste) {
        setClienteParaCriar(data.emitente);
        setIsClienteModalOpen(true);
      } else if (!data.sacadoExiste) {
        setSacadoParaCriar(data.sacado);
        setIsSacadoModalOpen(true);
      } else {
        preencherFormularioComXml(data);
      }
    } catch (error) {
      showNotification(error.message, "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const preencherFormularioComXml = (data) => {
    const prazosArray = data.parcelas
      ? data.parcelas.map((p) => {
          const d1 = new Date(data.dataEmissao);
          const d2 = new Date(p.dataVencimento);
          return Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) +1;
        })
      : [];
    const prazosString = prazosArray.join("/");
    const valorFormatado = data.valorTotal
      ? formatBRLInput(String(data.valorTotal * 100))
      : "";

    const nomeExibicaoSacado = data.sacado.matriz_id
      ? `${data.sacado.nome} [Filial - ${data.sacado.uf}]`
      : data.sacado.nome;

    setNovaNf({
      nfCte: data.numeroNf || data.numeroCte || "",
      dataNf: data.dataEmissao ? data.dataEmissao.split("T")[0] : "",
      valorNf: valorFormatado,
      clienteSacado: nomeExibicaoSacado,
      parcelas:
        data.parcelas && data.parcelas.length > 0
          ? String(data.parcelas.length)
          : "1",
      prazos: prazosString,
      peso: "",
    });

    setEmpresaCedente(data.emitente.nome || "");
    setEmpresaCedenteId(data.emitente.id || null);
    setCedenteRamo(data.emitente.ramo_de_atividade || "");
    setCedenteSelecionado(data.emitente); 
    setSacadoSelecionado(data.sacado); 
    const condicoes = data.sacado.condicoes_pagamento || [];
    setCondicoesSacado(condicoes);
    if (condicoes.length > 0 && !prazosString) {
        const condicaoPadrao = condicoes[0];
        setNovaNf(prev => ({
            ...prev,
            prazos: condicaoPadrao.prazos,
            parcelas: String(condicaoPadrao.parcelas),
        }));
    }

    showNotification("Dados do XML preenchidos com sucesso!", "success");
    setXmlDataPendente(null);
  };

  const handleSaveNovoCliente = async (id, data) => {
    try {
      const response = await fetch(`/api/cadastros/clientes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorText = await response.json();
        throw new Error(errorText.message || "Falha ao criar novo cliente.");
      }

      const novoClienteCriado = await response.json();
      const updatedXmlData = {
        ...xmlDataPendente,
        emitente: {
          ...xmlDataPendente.emitente,
          id: novoClienteCriado.id,
          ramo_de_atividade: data.ramoDeAtividade,
          contasBancarias: data.contasBancarias || [], 
        },
        emitenteExiste: true,
      };
      setXmlDataPendente(updatedXmlData);

      showNotification("Cliente criado com sucesso!", "success");
      setIsClienteModalOpen(false);

      if (!updatedXmlData.sacadoExiste) {
        setSacadoParaCriar(updatedXmlData.sacado);
        setIsSacadoModalOpen(true);
      } else {
        preencherFormularioComXml(updatedXmlData);
      }
      return { success: true };
    } catch (err) {
      showNotification(err.message, "error");
      return { success: false, message: err.message };
    }
  };

  const handleSaveNovoSacado = async (id, data) => {
    try {
      const response = await fetch(`/api/cadastros/sacados`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorText = await response.json();
        throw new Error(errorText.message || "Falha ao criar novo sacado.");
      }
      const novoSacadoCriado = await response.json();
      const updatedXmlData = {
        ...xmlDataPendente,
        sacado: { 
            ...xmlDataPendente.sacado, 
            id: novoSacadoCriado.id,
            condicoes_pagamento: data.condicoesPagamento || []
        },
        sacadoExiste: true,
      };
      showNotification("Sacado criado com sucesso!", "success");
      setIsSacadoModalOpen(false);
      preencherFormularioComXml(updatedXmlData);
      return { success: true };
    } catch (err) {
      showNotification(err.message, "error");
      return { success: false, message: err.message };
    }
  };

  const handleSelectCedente = (cliente) => {
    setEmpresaCedente(cliente.nome);
    setEmpresaCedenteId(cliente.id);
    setCedenteRamo(cliente.ramo_de_atividade || "");
    setCedenteSelecionado(cliente); 
  };

  const handleCedenteChange = (newName) => {
    setEmpresaCedente(newName);
    setEmpresaCedenteId(null);
    setCedenteRamo("");
    setCedenteSelecionado(null); 
  };

  const handleSelectSacado = (sacado) => {
    setSacadoSelecionado(sacado); 
    const condicoes =
      sacado.condicoes_pagamento || sacado.condicoesPagamento || [];
    setCondicoesSacado(condicoes);

    const nomeExibicao = sacado.matriz_id
      ? `${sacado.nome} [Filial - ${sacado.uf}]`
      : sacado.nome;

    if (condicoes.length > 0) {
      const condicaoPadrao = condicoes[0];
      setNovaNf((prev) => ({
        ...prev,
        clienteSacado: nomeExibicao,
        prazos: condicaoPadrao.prazos,
        parcelas: String(condicaoPadrao.parcelas),
      }));
    } else {
      setNovaNf((prev) => ({
        ...prev,
        clienteSacado: nomeExibicao,
        prazos: "",
        parcelas: "1",
      }));
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'clienteSacado' && !value) {
        setSacadoSelecionado(null);
    }
    setNovaNf((prevState) => ({
      ...prevState,
      [name]: name === "valorNf" ? formatBRLInput(value) : value,
    }));
  };

  const handleAddNotaFiscal = async (e) => {
    e.preventDefault();
    if (!tipoOperacaoId || !dataOperacao || !novaNf.clienteSacado || !sacadoSelecionado) {
      showNotification(
        "Preencha os Dados da Operação e selecione um Sacado válido da lista.",
        "error"
      );
      return;
    }
    setIsLoading(true);
    const valorNfFloat = parseBRL(novaNf.valorNf);
    const body = {
      dataOperacao,
      tipoOperacaoId: parseInt(tipoOperacaoId),
      dataNf: novaNf.dataNf,
      valorNf: valorNfFloat,
      parcelas: parseInt(novaNf.parcelas) || 1,
      prazos: novaNf.prazos,
      peso: parseFloat(String(novaNf.peso).replace(",", ".")) || null,
    };
    try {
      const response = await fetch(`/api/operacoes/calcular-juros`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).message || "Falha ao calcular os juros."
        );
      const calculoResult = await response.json();
      setNotasFiscais([
        ...notasFiscais,
        {
          id: Date.now(),
          ...novaNf,
          clienteSacado: sacadoSelecionado.nome, 
          sacadoId: sacadoSelecionado.id, 
          valorNf: valorNfFloat,
          parcelas: parseInt(novaNf.parcelas) || 1,
          jurosCalculado: calculoResult.totalJuros,
          valorLiquidoCalculado: calculoResult.valorLiquido,
          parcelasCalculadas: calculoResult.parcelasCalculadas,
        },
      ]);
      setNovaNf({
        nfCte: "",
        dataNf: "",
        valorNf: "",
        clienteSacado: "",
        parcelas: "1",
        prazos: "",
        peso: "",
      });
      setSacadoSelecionado(null);
    } catch (error) {
      showNotification(error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleConfirmRecompra = async (data) => {
    if (data && data.credito !== null && data.principal !== null) {
      setDescontos(prev => [
        ...prev,
        {
          id: `recompra-debito-${Date.now()}`,
          descricao: `Débito Recompra ${data.descricao.split(' ').pop()}`, 
          valor: Math.abs(data.principal) 
        },
        {
          id: `recompra-credito-${Date.now() + 1}`,
          descricao: `Crédito Juros Recompra ${data.descricao.split(' ').pop()}`,
          valor: -Math.abs(data.credito) 
        }
      ]);

      try {
        const response = await fetch('/api/duplicatas/liquidar-recompra', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({
            duplicataIds: data.duplicataIds,
            dataLiquidacao: dataOperacao 
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.message || 'Falha ao dar baixa nas duplicatas de recompra.');
        }
        
        showNotification("Recompra adicionada e duplicatas originais liquidadas!", "success");
      
      } catch (err) {
        showNotification(`Erro ao liquidar duplicatas: ${err.message}`, "error");
      }
      setIsRecompraModalOpen(false);
    }
  };
  
  const handleSalvarOperacao = () => {
    if (notasFiscais.length === 0 || !contaBancariaId) {
      showNotification(
        "Adicione ao menos uma NF e selecione uma conta bancária.",
        "error"
      );
      return;
    }
    if (!empresaCedenteId) {
      showNotification(
        "Selecione um cedente válido da lista antes de salvar.",
        "error"
      );
      return;
    }
    if (isPagarComPix && !pixData.chave) {
        showNotification("Por favor, selecione uma Chave PIX para o pagamento.", "error");
        return;
    }

    if (isPagarComPix && !isPartialDebit) {
      const contaOrigemObj = contasBancarias.find(c => c.id === parseInt(contaBancariaId));
      setPixPayload({
        valor: totais.liquidoOperacao,
        contaOrigem: contaOrigemObj ? formatDisplayConta(`${contaOrigemObj.banco} - ${contaOrigemObj.agencia}/${contaOrigemObj.contaCorrente}`) : 'N/A',
        favorecido: empresaCedente,
        chave: pixData.chave,
        tipo_chave_pix: pixData.tipo_chave_pix
      });
      setIsPixConfirmOpen(true);
    } 
    else if (isPagarComPix && isPartialDebit) {
      if (!valorParcialPendente) {
          showNotification("Por favor, confirme o valor do débito parcial.", "info");
          setIsPartialDebitModalOpen(true);
          return;
      }
      const contaOrigemObj = contasBancarias.find(c => c.id === parseInt(contaBancariaId));
      setPixPayload({
        valor: valorParcialPendente,
        contaOrigem: contaOrigemObj ? formatDisplayConta(`${contaOrigemObj.banco} - ${contaOrigemObj.agencia}/${contaOrigemObj.contaCorrente}`) : 'N/A',
        favorecido: empresaCedente,
        chave: pixData.chave,
        tipo_chave_pix: pixData.tipo_chave_pix
      });
      setIsPixConfirmOpen(true);
    }
    else if (isPartialDebit && !isPagarComPix) {
       if (!valorParcialPendente) {
          showNotification("Por favor, confirme o valor e data do débito parcial.", "info");
          setIsPartialDebitModalOpen(true);
          return;
      }
      confirmarSalvamento(valorParcialPendente, dataParcialPendente, false);
    } 
    else {
      confirmarSalvamento(null, null, false);
    }
  };

  const confirmarSalvamento = async (valorDebito = null, dataDebito = null, isPix = false, pixResultData = null) => {
    setIsPartialDebitModalOpen(false);
    setIsPixConfirmOpen(false);
    setIsSaving(true);
    
    const finalLiquidoOperacao = jurosPre
      ? totais.liquidoOperacao
      : totais.valorTotalBruto - totais.totalOutrosDescontos;

    const payload = {
      dataOperacao,
      tipoOperacaoId: parseInt(tipoOperacaoId),
      clienteId: empresaCedenteId,
      contaBancariaId: parseInt(contaBancariaId),
      totais: {
        ...totais,
        liquidoOperacao: finalLiquidoOperacao,
      },
      descontos: todosOsDescontos.map(({ id, ...rest }) => rest),
      notasFiscais,
      cedenteRamo,
      valorDebito,
      dataDebito,
      efetuar_pix: isPix,
      pixEndToEndId: isPix ? pixResultData?.transactionId : null,
    };

    try {
      const response = await fetch(`/api/operacoes/salvar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Ocorreu um erro ao salvar a operação."
        );
      }
      const operacaoId = await response.json();
      setSavedOperacaoInfo({ id: operacaoId, clienteId: empresaCedenteId });

      // --- 3. TERCEIRA ALTERAÇÃO: MONTAR O RECIBO COMPLETO ---
      if (isPix) {
        showNotification("Operação salva e PIX enviado com sucesso!", "success");

        // Busca os dados da conta do recebedor (cedente) que foi usada
        const recebedorConta = (cedenteSelecionado.contasBancarias || []).find(c => c.chave_pix === pixPayload.chave) || (cedenteSelecionado.contasBancarias || [])[0] || {};

        setReceiptData({
          valor: pixPayload.valor,
          data: new Date(), // <-- Hora exata da transação, como solicitado
          transactionId: pixResultData.transactionId,
          descricao: `Pagamento Borderô #${operacaoId}`,
          pagador: {
              nome: clienteMasterInfo.nome,
              cnpj: clienteMasterInfo.cnpj,
              conta: pixPayload.contaOrigem || 'N/A',
          },
          recebedor: {
             nome: empresaCedente,
             cnpj: cedenteSelecionado.cnpj,
             instituicao: recebedorConta.banco,
             chavePix: pixPayload.chave
          }
        });
        setIsReceiptModalOpen(true);
        handleLimparTudo(false);
      } else {
        setIsEmailModalOpen(true);
      }
    } catch (error) {
      showNotification(error.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmarSalvamentoEPIX = async () => {
    setIsSaving(true);
    setIsPixConfirmOpen(false);

    const contaOrigemObj = contasBancarias.find(c => c.id === parseInt(contaBancariaId));
    
    const valorDebitado = pixPayload.valor; 
    const dataPagamento = (isPartialDebit && dataParcialPendente) 
                          ? dataParcialPendente 
                          : new Date().toISOString().split("T")[0];

    const payloadParaApiPix = {
        valor: valorDebitado,
        descricao: `Pagamento Borderô #${empresaCedenteId}`,
        contaOrigem: contaOrigemObj.contaCorrente,
        empresaAssociada: empresaCedente,
        pix: {
            tipo: pixData.tipo_chave_pix,
            chave: pixData.chave
        },
        skipSave: true 
    };

    try {
        const pixResponse = await fetch('/api/lancamentos/pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(payloadParaApiPix),
        });

        const pixResult = await pixResponse.json();
        
        if (!pixResponse.ok || !pixResult.success) {
            throw new Error(pixResult.message || 'Falha ao enviar o PIX.');
        }
        
        const pixApiResultData = pixResult.pixResult;
        const transactionId = pixApiResultData.cod_pagamento || pixApiResultData.transacaoPix?.endToEnd; 

        if (!transactionId) {
            console.warn("Resposta PIX OK, mas 'transaction_id' não foi encontrado.", pixApiResultData);
        }

        await confirmarSalvamento(valorDebitado, dataPagamento, true, { transactionId });

    } catch (error) {
        showNotification(error.message, "error");
        setIsSaving(false);
    }
  };

  const finalizarOperacao = () => {
    if (savedOperacaoInfo) {
      showNotification(`Operação salva com sucesso!`, "success");
    }
    handleLimparTudo(false);
  };

  const handleSendEmail = async (destinatarios) => {
    if (!savedOperacaoInfo) return;
    setIsSendingEmail(true);
    try {
      const response = await fetch(
        `/api/operacoes/${savedOperacaoInfo.id}/enviar-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          body: JSON.stringify({ destinatarios }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao enviar o e-mail.");
      }
      showNotification("E-mail(s) enviado(s) com sucesso!", "success");
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      setIsSendingEmail(false);
      setIsEmailModalOpen(false);
      finalizarOperacao();
    }
  };

  const handleCloseEmailModal = () => {
    setIsEmailModalOpen(false);
    finalizarOperacao();
  };

  const handleLimparTudo = (showMsg = true) => {
    setDataOperacao(new Date().toISOString().split("T")[0]);
    setTipoOperacaoId("");
    setEmpresaCedente("");
    setEmpresaCedenteId(null);
    setCedenteRamo("");
    setCedenteSelecionado(null); 
    setNotasFiscais([]);
    setDescontos([]);
    setNovaNf({
      nfCte: "",
      dataNf: "",
      valorNf: "",
      clienteSacado: "",
      parcelas: "1",
      prazos: "",
      peso: "",
    });
    setSacadoSelecionado(null);
    setCondicoesSacado([]);
    setIgnoreDespesasBancarias(false);
    setIsPartialDebit(false);
    setIsPagarComPix(false);
    setPixData({ tipo_chave_pix: 'CPF/CNPJ', chave: '' });
    setjurosPre(true);
    setValorParcialPendente(null);
    setDataParcialPendente(null);
    
    if (showMsg) showNotification("Formulário limpo.", "success");
  };

  const todosOsDescontos = useMemo(() => {
    const selectedOperacao = tiposOperacao.find(
      (op) => op.id === parseInt(tipoOperacaoId)
    );
    const despesasBancarias = selectedOperacao?.despesasBancarias || 0;
    const combined = [...descontos];
    if (despesasBancarias > 0 && !ignoreDespesasBancarias) {
      combined.push({
        id: "despesas-bancarias",
        descricao: "Despesas Bancárias",
        valor: despesasBancarias,
      });
    }
    return combined;
  }, [descontos, tipoOperacaoId, tiposOperacao, ignoreDespesasBancarias]);

  const showPeso = useMemo(() => {
    const selectedOperacao = tiposOperacao.find(
      (op) => op.id === parseInt(tipoOperacaoId)
    );
    return selectedOperacao?.usarPesoNoValorFixo || false;
  }, [tipoOperacaoId, tiposOperacao]);

  const totais = useMemo(() => {
    const valorTotalBruto = notasFiscais.reduce(
      (acc, nf) => acc + nf.valorNf,
      0
    );
    const desagioTotal = notasFiscais.reduce(
      (acc, nf) => acc + (nf.jurosCalculado || 0),
      0
    );
    
    const totalOutrosDescontos = todosOsDescontos.reduce(
      (acc, d) => acc + d.valor, 
      0
    );
    
    const liquidoOperacao = jurosPre
      ? valorTotalBruto - desagioTotal - totalOutrosDescontos
      : valorTotalBruto - totalOutrosDescontos;

    return {
      valorTotalBruto,
      desagioTotal,
      totalOutrosDescontos,
      liquidoOperacao,
    };
  }, [notasFiscais, todosOsDescontos, jurosPre]);

  const handleRemoveDesconto = (idToRemove) => {
    if (idToRemove === "despesas-bancarias") {
      setIgnoreDespesasBancarias(true);
    } else {
      if (String(idToRemove).startsWith('recompra-')) {
          showNotification("Não é possível remover itens de recompra. Limpe o borderô para cancelar.", "error");
          return;
      }
      setDescontos(descontos.filter((d) => d.id !== idToRemove));
    }
  };
  
  const handlePartialDebitChange = (isChecked) => {
    if (isChecked) {
      setIsPartialDebitModalOpen(true); 
    } else {
      setIsPartialDebit(false);
      setValorParcialPendente(null);
      setDataParcialPendente(null);
    }
  };

  const handlePartialDebitConfirm = (valor, data) => {
    const valorParcialNum = parseFloat(valor);
    
    setIsPartialDebit(true);
    setValorParcialPendente(valorParcialNum);
    setDataParcialPendente(data);
    setIsPartialDebitModalOpen(false);

    if (isPagarComPix) {
      const contaOrigemObj = contasBancarias.find(c => c.id === parseInt(contaBancariaId));
      setPixPayload({
        valor: valorParcialNum,
        contaOrigem: contaOrigemObj ? formatDisplayConta(`${contaOrigemObj.banco} - ${contaOrigemObj.agencia}/${contaOrigemObj.contaCorrente}`) : 'N/A',
        favorecido: empresaCedente,
        chave: pixData.chave,
        tipo_chave_pix: pixData.tipo_chave_pix
      });
      setIsPixConfirmOpen(true);
    }
  };
  
  const handlePixChange = (isChecked) => {
    setIsPagarComPix(isChecked);

    if (isChecked && isPartialDebit && valorParcialPendente) {
      const contaOrigemObj = contasBancarias.find(c => c.id === parseInt(contaBancariaId));
      setPixPayload({
        valor: valorParcialPendente,
        contaOrigem: contaOrigemObj ? formatDisplayConta(`${contaOrigemObj.banco} - ${contaOrigemObj.agencia}/${contaOrigemObj.contaCorrente}`) : 'N/A',
        favorecido: empresaCedente,
        chave: pixData.chave,
        tipo_chave_pix: pixData.tipo_chave_pix
      });
      setIsPixConfirmOpen(true);
    }
  };

  return (
    <>
      <Notification
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ message: "", type: "" })}
      />
      <DescontoModal
        isOpen={isDescontoModalOpen}
        onClose={() => setIsDescontoModalOpen(false)}
        onSave={(d) => setDescontos([...descontos, d])}
      />
      <EditClienteModal
        isOpen={isClienteModalOpen}
        onClose={() => { setIsClienteModalOpen(false); setClienteParaCriar(null); }}
        onSave={handleSaveNovoCliente}
        cliente={clienteParaCriar}
      />
      <EditSacadoModal
        isOpen={isSacadoModalOpen}
        onClose={() => { setIsSacadoModalOpen(false); setSacadoParaCriar(null); }}
        onSave={handleSaveNovoSacado}
        sacado={sacadoParaCriar}
      />
      <EmailModal
        isOpen={isEmailModalOpen}
        onClose={handleCloseEmailModal}
        onSend={handleSendEmail}
        isSending={isSendingEmail}
        clienteId={savedOperacaoInfo?.clienteId}
      />
      <PartialDebitModal
        isOpen={isPartialDebitModalOpen}
        onClose={() => setIsPartialDebitModalOpen(false)}
        onConfirm={handlePartialDebitConfirm}
        totalValue={totais.liquidoOperacao}
      />
      <PixConfirmationModal
        isOpen={isPixConfirmOpen}
        onClose={() => setIsPixConfirmOpen(false)}
        onConfirm={confirmarSalvamentoEPIX}
        data={pixPayload}
        isSending={isSaving}
      />
      <PixReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        receiptData={receiptData}
       />
      <RecompraModal
        isOpen={isRecompraModalOpen}
        onClose={() => setIsRecompraModalOpen(false)}
        onConfirm={handleConfirmRecompra}
        dataNovaOperacao={dataOperacao}
      />

      <main className="h-full overflow-y-auto p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
        <motion.header
          className="mb-4 flex justify-between items-center border-b-2 border-orange-500 pb-4"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div>
            <h1 className="text-3xl font-bold">Criar Borderô</h1>
            <p className="text-sm text-gray-300 mt-1">
              Preencha os dados abaixo ou importe um XML
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="file"
              accept=".xml"
              ref={fileInputRef}
              onChange={handleXmlUpload}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileInputRef.current.click()}
              className="bg-gray-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-gray-600 transition"
            >
              Importar NF/CT-e (XML)
            </button>
          </div>
        </motion.header>

        <OperacaoHeader
          dataOperacao={dataOperacao}
          setDataOperacao={setDataOperacao}
          tipoOperacaoId={tipoOperacaoId}
          setTipoOperacaoId={setTipoOperacaoId}
          tiposOperacao={tiposOperacao}
          empresaCedente={empresaCedente}
          onCedenteChange={handleCedenteChange}
          onSelectCedente={handleSelectCedente}
          fetchClientes={fetchClientes}
        />
        <AdicionarNotaFiscalForm
          novaNf={novaNf}
          handleInputChange={handleInputChange}
          handleAddNotaFiscal={handleAddNotaFiscal}
          isLoading={isLoading}
          onSelectSacado={handleSelectSacado}
          fetchSacados={fetchSacados}
          condicoesSacado={condicoesSacado}
          setNovaNf={setNovaNf}
          cedenteRamo={cedenteRamo}
          showPeso={showPeso}
        />
        <OperacaoDetalhes
          notasFiscais={notasFiscais}
          descontos={todosOsDescontos}
          totais={totais}
          handleSalvarOperacao={handleSalvarOperacao}
          handleLimparTudo={handleLimparTudo}
          isSaving={isSaving}
          onAddDescontoClick={() => setIsDescontoModalOpen(true)}
          onRemoveDesconto={handleRemoveDesconto}
          onRecompraClick={() => setIsRecompraModalOpen(true)}
          contasBancarias={contasBancarias}
          contaBancariaId={contaBancariaId}
          setContaBancariaId={setContaBancariaId}
          cedenteRamo={cedenteRamo}
          isPartialDebit={isPartialDebit}
          handlePartialDebitChange={handlePartialDebitChange}
          jurosPre={jurosPre}
          setjurosPre={setjurosPre}
          isPagarComPix={isPagarComPix}
          handlePixChange={handlePixChange}
          pixData={pixData}
          setPixData={setPixData}
          cedenteSelecionado={cedenteSelecionado}
        />
      </main>
    </>
  );
}