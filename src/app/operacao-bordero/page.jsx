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
import { formatBRLInput, parseBRL, formatDisplayConta, formatDate } from "../utils/formatters.jsx";

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
  const [isXmlBatchModalOpen, setIsXmlBatchModalOpen] = useState(false);
  const [xmlBatchFiles, setXmlBatchFiles] = useState([]);
  const [xmlBatchStatus, setXmlBatchStatus] = useState({});
  const [isProcessingXmlBatch, setIsProcessingXmlBatch] = useState(false);
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

  const [clienteMasterInfo, setClienteMasterInfo] = useState({ nome: "", cnpj: "" });

  const getAuthHeader = () => {
    const token = sessionStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: "", type: "" }), 5000);
  };

  const getDuplicataIdentifiers = (nfCte, parcelasCalculadas = []) => {
    const base = String(nfCte || '').trim();
    if (!base) return [];

    const identifiers = (parcelasCalculadas || [])
      .map((parcela) => {
        const numero = parcela?.numeroParcela ?? parcela?.numero ?? parcela?.parcela;
        if (numero === null || numero === undefined || numero === '') return null;
        return `${base}.${String(numero).trim()}`;
      })
      .filter(Boolean);

    return identifiers.length > 0 ? [...new Set(identifiers)] : [`${base}.1`];
  };

  const buildBorderoDescricao = (documentos = []) => {
    const numeros = [...new Set(
      documentos
        .map((item) => String(item?.nfCte || '').trim())
        .filter(Boolean)
    )];
    const tipos = [...new Set(
      documentos
        .map((item) => String(item?.tipoDocumento || '').trim())
        .filter(Boolean)
    )];

    let prefixo = 'Borderô';
    if (tipos.length === 1) {
      prefixo = tipos[0] === 'CTe' ? 'Borderô CT-e' : 'Borderô NF-e';
    }

    return numeros.length > 0 ? `${prefixo} ${numeros.join(', ')}` : prefixo;
  };

  const buildDuplicatasPayload = (documentos = []) => {
    return documentos.flatMap((documento) => {
      const base = String(documento?.nfCte || '').trim();
      const parcelas = Array.isArray(documento?.parcelasCalculadas) && documento.parcelasCalculadas.length > 0
        ? documento.parcelasCalculadas
        : [{ numeroParcela: 1 }];

      return parcelas
        .map((parcela) => {
          const numeroParcela = parcela?.numeroParcela ?? parcela?.numero ?? parcela?.parcela ?? 1;
          return base ? `${base}.${String(numeroParcela).trim()}` : null;
        })
        .filter(Boolean);
    });
  };

  const sortDocumentosByNumber = (documentos = []) => [...documentos].sort((a, b) =>
    String(a?.nfCte || "").localeCompare(
      String(b?.nfCte || ""),
      "pt-BR",
      { numeric: true, sensitivity: "base" }
    )
  );

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
        jurosPreFixado: t.juros_pre_fixado,
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

  // --- ATUALIZAÇÃO IMPORTANTE AQUI ---
  const handleXmlBatchSelection = (event) => {
    const selected = Array.from(event.target.files || []);
    const xmlFiles = selected.filter((file) => file.name.toLowerCase().endsWith(".xml"));
    if (xmlFiles.length !== selected.length) {
      showNotification("Apenas arquivos XML são permitidos. Os demais foram ignorados.", "error");
    }

    if (xmlFiles.length === 1 && selected.length === 1 && xmlBatchFiles.length === 0) {
      setIsXmlBatchModalOpen(false);
      setXmlBatchFiles([]);
      setXmlBatchStatus({});
      handleXmlUpload(event);
      return;
    }

    setXmlBatchFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      return [...current, ...xmlFiles.filter((file) => !existing.has(`${file.name}-${file.size}-${file.lastModified}`))];
    });
    event.target.value = "";
  };

  const removeXmlBatchFile = (file) => {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    setXmlBatchFiles((current) => current.filter(
      (item) => `${item.name}-${item.size}-${item.lastModified}` !== key
    ));
    setXmlBatchStatus((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const closeXmlBatchModal = () => {
    if (isProcessingXmlBatch) return;
    setIsXmlBatchModalOpen(false);
    setXmlBatchFiles([]);
    setXmlBatchStatus({});
  };

  const buildNotaFromXml = async (data, currentNotas, batchCedenteId) => {
    if (!data.emitenteExiste || !data.emitente?.id) {
      throw new Error(`Cedente “${data.emitente?.nome || "não identificado"}” não está cadastrado.`);
    }
    if (!data.sacadoExiste || !data.sacado?.id) {
      throw new Error(`Sacado “${data.sacado?.nome || "não identificado"}” não está cadastrado.`);
    }
    if (batchCedenteId && String(batchCedenteId) !== String(data.emitente.id)) {
      throw new Error("O XML pertence a outro cedente. Use apenas documentos do mesmo cedente no borderô.");
    }

    const prazos = (data.parcelas || []).map((parcela) => {
      const emissao = new Date(`${data.dataEmissao}T00:00:00`);
      const vencimento = new Date(`${parcela.dataVencimento}T00:00:00`);
      return Math.ceil((vencimento - emissao) / (1000 * 60 * 60 * 24));
    });
    const condicaoPadrao = data.sacado.condicoes_pagamento?.[0];
    const prazosString = prazos.length > 0 ? prazos.join("/") : (condicaoPadrao?.prazos || "");
    const quantidadeParcelas = data.parcelas?.length || Number(condicaoPadrao?.parcelas) || 1;
    const nfCte = data.numeroNf || data.numeroCte || "";

    const calculoResponse = await fetch(`/api/operacoes/calcular-juros`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({
        dataOperacao,
        tipoOperacaoId: parseInt(tipoOperacaoId),
        dataNf: data.dataEmissao?.split("T")[0],
        valorNf: Number(data.valorTotal),
        parcelas: quantidadeParcelas,
        prazos: prazosString,
        peso: null,
      }),
    });
    const calculo = await calculoResponse.json();
    if (!calculoResponse.ok) throw new Error(calculo.message || "Falha ao calcular os juros.");

    const identifiers = getDuplicataIdentifiers(nfCte, calculo.parcelasCalculadas);
    const identifiersOnScreen = new Set(
      currentNotas
        .filter((nf) => String(nf.sacadoId) === String(data.sacado.id))
        .flatMap((nf) => getDuplicataIdentifiers(nf.nfCte, nf.parcelasCalculadas))
    );
    const repeated = identifiers.filter((identifier) => identifiersOnScreen.has(identifier));
    if (repeated.length > 0) throw new Error(`Documento já adicionado no borderô: ${repeated.join(", ")}.`);

    const validationResponse = await fetch('/api/duplicatas/verificar-operacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ nfCtes: identifiers, clienteId: data.emitente.id, sacadoId: data.sacado.id }),
    });
    const validation = await validationResponse.json();
    if (!validationResponse.ok || !validation.ok) {
      throw new Error(validation.message || "Esta NF/CT-e já foi operada.");
    }

    return {
      id: `${Date.now()}-${nfCte}-${Math.random()}`,
      nfCte,
      dataNf: data.dataEmissao?.split("T")[0] || "",
      valorNf: Number(data.valorTotal),
      clienteSacado: data.sacado.nome,
      sacadoId: data.sacado.id,
      parcelas: quantidadeParcelas,
      prazos: prazosString,
      peso: "",
      tipoDocumento: data.tipo || null,
      jurosCalculado: calculo.totalJuros,
      valorLiquidoCalculado: calculo.valorLiquido,
      parcelasCalculadas: calculo.parcelasCalculadas,
    };
  };

  const processXmlBatch = async (filesToProcess = xmlBatchFiles) => {
    if (!tipoOperacaoId || !dataOperacao) {
      showNotification("Selecione o tipo e a data da operação antes de importar os XMLs.", "error");
      return;
    }
    if (filesToProcess.length === 0) {
      showNotification("Selecione ao menos um arquivo XML.", "error");
      return;
    }

    setIsProcessingXmlBatch(true);
    let workingNotas = [...notasFiscais];
    let imported = 0;
    let firstCedente = cedenteSelecionado;
    let batchCedenteId = empresaCedenteId;

    const orderedFiles = [...filesToProcess].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" })
    );

    for (const file of orderedFiles) {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      setXmlBatchStatus((current) => ({ ...current, [key]: { status: "processing", message: "Processando..." } }));
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(`/api/upload/nfe-xml`, {
          method: "POST",
          headers: { ...getAuthHeader() },
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Falha ao ler o arquivo XML.");

        if (data.emitenteExiste && data.emitente?.id) {
          const detailsResponse = await fetch(`/api/cadastros/clientes/${data.emitente.id}`, { headers: getAuthHeader() });
          if (detailsResponse.ok) {
            const details = await detailsResponse.json();
            data.emitente = { ...data.emitente, ...details, nome: details.nome };
          }
        }

        const nota = await buildNotaFromXml(data, workingNotas, batchCedenteId);
        workingNotas.push(nota);
        imported += 1;
        batchCedenteId = data.emitente.id;
        firstCedente ||= data.emitente;
        setXmlBatchStatus((current) => ({ ...current, [key]: { status: "success", message: "Adicionado ao borderô." } }));
      } catch (error) {
        setXmlBatchStatus((current) => ({ ...current, [key]: { status: "error", message: error.message } }));
      }
    }

    setNotasFiscais(sortDocumentosByNumber(workingNotas));
    if (firstCedente && imported > 0) {
      setEmpresaCedente(firstCedente.nome || "");
      setEmpresaCedenteId(firstCedente.id);
      setCedenteRamo(firstCedente.ramo_de_atividade || "");
      setCedenteSelecionado(firstCedente);
    }
    setIsProcessingXmlBatch(false);
    setIsXmlBatchModalOpen(false);
    setXmlBatchFiles([]);
    setXmlBatchStatus({});
    showNotification(
      imported === filesToProcess.length
        ? `${imported} XML(s) importado(s) com sucesso!`
        : `${imported} de ${filesToProcess.length} XML(s) foram importados. Os demais apresentaram erro.`,
      imported === filesToProcess.length ? "success" : "error"
    );
  };

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
      
      let data = await response.json(); // Usando let para permitir mutação

      // Se o emitente já existe (identificado por CNPJ no back), buscamos os dados completos (incluindo chaves PIX)
      if (data.emitenteExiste && data.emitente.id) {
        try {
            const clientFullRes = await fetch(`/api/cadastros/clientes/${data.emitente.id}`, {
                headers: getAuthHeader()
            });
            if (clientFullRes.ok) {
                const clientFullData = await clientFullRes.json();
                // Sobrescrevemos o emitente do XML com os dados oficiais do banco
                data.emitente = {
                    ...data.emitente,
                    ...clientFullData, // Traz contas bancárias, chaves pix, etc.
                    nome: clientFullData.nome // Garante o nome oficial
                };
            }
        } catch (fetchErr) {
            console.error("Erro ao buscar detalhes completos do cliente:", fetchErr);
            // Continua com os dados do XML se falhar
        }
      }

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
  // --- FIM DA ATUALIZAÇÃO ---

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
      tipoDocumento: data.tipo || null,
    });

    // Aqui garantimos que o nome e o objeto completo (com chaves pix) sejam usados
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
          nome: novoClienteCriado.nome, // Garante nome atualizado
          ramo_de_atividade: data.ramoDeAtividade,
          contasBancarias: data.contasBancarias || [], // Garante chaves pix
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
    if (!empresaCedenteId) {
      showNotification(
        "Selecione o cedente correto antes de adicionar a NF/CT-e.",
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
      const novosIdentificadores = getDuplicataIdentifiers(
        novaNf.nfCte,
        calculoResult.parcelasCalculadas
      );

      const identificadoresJaAdicionados = new Set(
        notasFiscais
          .filter((nf) => String(nf.sacadoId) === String(sacadoSelecionado.id))
          .flatMap((nf) => getDuplicataIdentifiers(nf.nfCte, nf.parcelasCalculadas))
      );

      const repetidosNaTela = novosIdentificadores.filter((id) => identificadoresJaAdicionados.has(id));
      if (repetidosNaTela.length > 0) {
        showNotification(
          `Esta NF/CT-e já foi adicionada no borderô: ${repetidosNaTela.join(', ')}.`,
          "error"
        );
        return;
      }

      const validacaoResponse = await fetch('/api/duplicatas/verificar-operacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          nfCtes: novosIdentificadores,
          clienteId: empresaCedenteId,
          sacadoId: sacadoSelecionado.id,
        }),
      });

      const validacaoData = await validacaoResponse.json();
      if (!validacaoResponse.ok || !validacaoData.ok) {
        throw new Error(validacaoData.message || "Esta NF/CT-e já foi operada.");
      }

      setNotasFiscais([
        ...notasFiscais,
        {
          id: Date.now(),
          ...novaNf,
          tipoDocumento: xmlDataPendente?.tipo || novaNf.tipoDocumento || null,
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
  
  // 1. Adicionamos a flag 'isPrincipal' para diferenciar o Débito dos demais itens
  const handleConfirmRecompra = async (data) => {
    if (data && data.credito !== null && data.principal !== null) {
        
        const batchId = Date.now(); 
        const duplicataIds = data.duplicataIds || [];

        let descontosRecompra = [];

        // Item de Débito (Principal) - Esse segura a operação
        if (data.principal > 0) {
            descontosRecompra.push({
                id: `recompra-debito-${batchId}`,
                descricao: `Débito Recompra ${data.descricao || ''}`, 
                valor: Math.abs(data.principal),
                tipo: 'recompra',
                batchId: batchId,
                duplicataIds: duplicataIds,
                isPrincipal: true // <--- Identifica que este é o principal
            });
        }

        // Item de Crédito (Juros) - Acessório
        if (data.credito > 0) {
            descontosRecompra.push({
                id: `recompra-credito-${batchId}`,
                descricao: `Crédito Juros Recompra ${data.descricao || ''}`,
                valor: -Math.abs(data.credito),
                tipo: 'recompra',
                batchId: batchId,
                duplicataIds: duplicataIds,
                isPrincipal: false
            });
        }
        
        // Juros Adicionais - Acessório
        if (data.jurosAdicionais > 0) {
            descontosRecompra.push({
                id: `recompra-juros-${batchId}`,
                descricao: `Juros/Taxas Recompra ${data.descricao || ''}`,
                valor: Math.abs(data.jurosAdicionais),
                tipo: 'recompra',
                batchId: batchId,
                duplicataIds: duplicataIds,
                isPrincipal: false
            });
        }
        
        // Abatimentos - Acessório
        if (data.abatimentos > 0) {
            descontosRecompra.push({
                id: `recompra-abatimento-${batchId}`,
                descricao: `Abatimento Recompra ${data.descricao || ''}`,
                valor: -Math.abs(data.abatimentos),
                tipo: 'recompra',
                batchId: batchId,
                duplicataIds: duplicataIds,
                isPrincipal: false
            });
        }

        try {
          // Executa a baixa das duplicatas no banco
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
          
          setDescontos(prev => [ ...prev, ...descontosRecompra ]);
          showNotification("Recompra realizada com sucesso!", "success");
        
        } catch (err) {
            showNotification(`Erro ao processar recompra: ${err.message}`, "error");
        } finally {
            setIsRecompraModalOpen(false);
        }
    }
  };

  // 2. Função de estorno (só será chamada se excluir o Principal)
  const handleEstornarRecompra = async (itemRecompra) => {
    if (!itemRecompra.duplicataIds || itemRecompra.duplicataIds.length === 0) {
        setDescontos(prev => prev.filter(d => d.batchId !== itemRecompra.batchId));
        return;
    }

    setIsLoading(true);
    try {
        const promises = itemRecompra.duplicataIds.map(id => 
            fetch(`/api/duplicatas/${id}/estornar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({ motivo: 'Cancelamento de Recompra na tela de Operação' })
            })
        );

        await Promise.all(promises);

        // Remove TUDO do lote visualmente, pois o principal foi deletado
        setDescontos(prev => prev.filter(d => d.batchId !== itemRecompra.batchId));
        
        showNotification("Recompra cancelada e duplicatas estornadas.", "success");

    } catch (error) {
        console.error("Erro ao estornar recompra:", error);
        showNotification("Erro ao estornar as duplicatas. Verifique o console.", "error");
    } finally {
        setIsLoading(false);
    }
  };

  // 3. Nova lógica de remoção: se não for Principal, apenas tira da tela
  const handleRemoveDesconto = (idToRemove) => {
    if (idToRemove === "despesas-bancarias") {
      setIgnoreDespesasBancarias(true);
      return;
    } 

    const itemToRemove = descontos.find(d => d.id === idToRemove);

    if (itemToRemove && String(idToRemove).startsWith('recompra-')) {
        
        // Se for o item PRINCIPAL (Débito), estorna tudo
        if (itemToRemove.isPrincipal) {
             // Sem confirm(), direto para o estorno
             handleEstornarRecompra(itemToRemove);
        } else {
            // Se for Acessório (Crédito, Juros, etc), APENAS remove da tela
            // Mantém as duplicatas baixadas e o débito principal ativo
            setDescontos(prev => prev.filter(d => d.id !== idToRemove));
        }

    } else {
        // Remoção normal de outros descontos manuais
        setDescontos(descontos.filter((d) => d.id !== idToRemove));
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
      jurosPre: jurosPre, // Envia o status do checkbox
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
      const descricaoBordero = buildBorderoDescricao(notasFiscais);

      if (isPix) {
        showNotification("Operação salva e PIX enviado com sucesso!", "success");

        const recebedorConta = (cedenteSelecionado.contasBancarias || []).find(c => c.chave_pix === pixPayload.chave) || (cedenteSelecionado.contasBancarias || [])[0] || {};

        setReceiptData({
          valor: pixPayload.valor,
          data: new Date(), 
          transactionId: pixResultData.transactionId,
          descricao: descricaoBordero,
          pagador: {
              nome: clienteMasterInfo.nome,
              cnpj: clienteMasterInfo.cnpj,
              conta: pixPayload.contaOrigem || 'N/A',
          },
          recebedor: {
             nome: empresaCedente,
             cnpj: cedenteSelecionado?.cnpj,
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
    const descricaoBordero = buildBorderoDescricao(notasFiscais);
    const duplicatasPayload = buildDuplicatasPayload(notasFiscais);

    const payloadParaApiPix = {
        valor: valorDebitado,
        descricao: descricaoBordero,
        duplicatas: duplicatasPayload,
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

  // Função que cria a ponte: Fecha Comprovante -> Abre Email
  const handleCloseReceiptModal = () => {
    setIsReceiptModalOpen(false); // Fecha o comprovante
    setIsEmailModalOpen(true);    // Abre o modal de e-mail imediatamente
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

  useEffect(() => {
    const selectedOperacao = tiposOperacao.find(
      (op) => op.id === parseInt(tipoOperacaoId)
    );
    if (selectedOperacao && typeof selectedOperacao.jurosPreFixado === "boolean") {
      setjurosPre(selectedOperacao.jurosPreFixado);
    }
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
        onClose={handleCloseReceiptModal}
        receiptData={receiptData}
       />
      <RecompraModal
        isOpen={isRecompraModalOpen}
        onClose={() => setIsRecompraModalOpen(false)}
        onConfirm={handleConfirmRecompra}
        dataNovaOperacao={dataOperacao}
        clienteId={empresaCedenteId} 
      />

      {isXmlBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-3xl rounded-xl border border-gray-700 bg-gray-800 p-6 text-white shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Importar XMLs</h2>
                <p className="mt-1 text-sm text-gray-300">
                  Selecione vários arquivos NF-e/CT-e para processá-los no mesmo borderô.
                </p>
              </div>
              <button type="button" onClick={closeXmlBatchModal} disabled={isProcessingXmlBatch}
                className="text-2xl text-gray-400 hover:text-white disabled:opacity-50" aria-label="Fechar">
                ×
              </button>
            </div>

            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isProcessingXmlBatch}
              className="w-full rounded-lg border-2 border-dashed border-gray-600 px-6 py-8 text-center text-gray-300 transition hover:border-orange-400 hover:text-orange-300 disabled:cursor-not-allowed disabled:opacity-60">
              <span className="block text-lg font-semibold">Selecionar arquivos XML</span>
              <span className="mt-1 block text-sm">Você pode escolher vários arquivos de uma vez</span>
            </button>
            <input type="file" accept=".xml,text/xml,application/xml" multiple ref={fileInputRef}
              onChange={handleXmlBatchSelection} className="hidden" />

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {xmlBatchFiles.length === 0 ? (
                <p className="py-5 text-center text-sm text-gray-400">Nenhum arquivo selecionado.</p>
              ) : xmlBatchFiles.map((file) => {
                const key = `${file.name}-${file.size}-${file.lastModified}`;
                const check = xmlBatchStatus[key];
                return (
                  <div key={key} className="flex items-center justify-between gap-3 rounded-lg bg-gray-700/70 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className={`mt-1 text-xs ${check?.status === "error" ? "text-red-300" : check?.status === "success" ? "text-green-300" : "text-gray-400"}`}>
                        {check?.message || `${(file.size / 1024).toFixed(1)} KB`}
                      </p>
                    </div>
                    {!isProcessingXmlBatch && check?.status !== "success" && (
                      <button type="button" onClick={() => removeXmlBatchFile(file)}
                        className="rounded px-2 py-1 text-sm text-red-300 hover:bg-red-900/40">
                        Remover
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeXmlBatchModal} disabled={isProcessingXmlBatch}
                className="rounded-md bg-gray-600 px-5 py-2 font-semibold hover:bg-gray-500 disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={() => processXmlBatch()}
                disabled={isProcessingXmlBatch || xmlBatchFiles.length === 0}
                className="rounded-md bg-orange-500 px-5 py-2 font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-600">
                {isProcessingXmlBatch ? "Processando..." : `Processar ${xmlBatchFiles.length} XML(s)`}
              </button>
            </div>
          </motion.div>
        </div>
      )}

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
            <button
              onClick={() => setIsXmlBatchModalOpen(true)}
              className="bg-gray-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-gray-600 transition"
            >
              Importar NF/CT-e (XMLs)
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
