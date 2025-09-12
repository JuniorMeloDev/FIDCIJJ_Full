"use client";

import { useState, useEffect } from "react";
import {
  formatCnpjCpf,
  formatTelefone,
  formatCep,
  formatBRLInput, // Importar
  parseBRL, // Importar
} from "@/app/utils/formatters";
import AutocompleteInput from "./AutocompleteInput";

const TabButton = ({ label, isActive, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
      isActive
        ? "border-orange-500 text-orange-400 border-b-2"
        : "border-transparent text-gray-400 hover:text-gray-200"
    }`}
  >
    {label}
  </button>
);

export default function EditClienteModal({
  isOpen,
  onClose,
  cliente,
  onSave,
  onDelete,
}) {
  const initialState = {
    nome: "",
    cnpj: "",
    ie: "",
    cep: "",
    endereco: "",
    bairro: "",
    municipio: "",
    uf: "",
    fone: "",
    email: "",
    contasBancarias: [],
    ramoDeAtividade: "",
    emails: [],
    limite_credito: "", // Novo campo
  };
  const [formData, setFormData] = useState(initialState);
  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [userData, setUserData] = useState({ username: "", password: "" });
  const [loadingUser, setLoadingUser] = useState(false);

  const [activeTab, setActiveTab] = useState("dadosCadastrais");
  const [allTiposOperacao, setAllTiposOperacao] = useState([]);
  const [selectedTipos, setSelectedTipos] = useState(new Set());

  const getAuthHeader = () => {
    const token = sessionStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    const fetchAllTipos = async () => {
      try {
        const res = await fetch("/api/cadastros/tipos-operacao", {
          headers: getAuthHeader(),
        });
        if (res.ok) setAllTiposOperacao(await res.json());
      } catch (e) {
        console.error("Falha ao buscar tipos de operação", e);
        setModalError("Não foi possível carregar os tipos de operação.");
      }
    };
    if (isOpen) fetchAllTipos();
  }, [isOpen]);

  useEffect(() => {
    const fetchUserData = async () => {
      if (cliente?.id) {
        setLoadingUser(true);
        try {
          const res = await fetch(`/api/users/by-client/${cliente.id}`, {
            headers: getAuthHeader(),
          });
          if (res.ok) {
            const data = await res.json();
            setUserData({ username: data.username || "", password: "" });
          } else {
            setUserData({ username: "", password: "" });
          }
        } catch (e) {
          setUserData({ username: "", password: "" });
        } finally {
          setLoadingUser(false);
        }
      }
    };

    if (isOpen) {
      setModalError("");
      setActiveTab("dadosCadastrais");
      if (cliente) {
        const initialData = {
          ...initialState,
          ...cliente,
          cnpj: cliente.cnpj ? formatCnpjCpf(cliente.cnpj) : "",
          fone: cliente.fone ? formatTelefone(cliente.fone) : "",
          cep: cliente.cep ? formatCep(cliente.cep) : "",
          limite_credito: cliente.limite_credito ? formatBRLInput(String(cliente.limite_credito * 100)) : "",
          contasBancarias: cliente.contasBancarias
            ? [...cliente.contasBancarias]
            : [],
          emails: cliente.emails ? [...cliente.emails] : [],
        };
        setFormData(initialData);
        if (cliente.cliente_tipos_operacao) {
          setSelectedTipos(
            new Set(
              cliente.cliente_tipos_operacao.map((t) => t.tipo_operacao_id)
            )
          );
        } else {
          setSelectedTipos(new Set());
        }
        fetchUserData();
      } else {
        setFormData(initialState);
        setUserData({ username: "", password: "" });
        setSelectedTipos(new Set());
      }
    }
  }, [cliente, isOpen]);

  const handleCnpjSearch = async (cnpjValue) => {
    const cleanCnpj = cnpjValue.replace(/\D/g, "");
    if (cleanCnpj.length !== 14) return;
    setIsFetchingCnpj(true);
    try {
      const response = await fetch(
        `https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`
      );
      if (!response.ok) throw new Error("CNPJ não encontrado ou inválido.");
      const data = await response.json();
      setFormData((prev) => ({
        ...prev,
        nome: data.razao_social || "",
        fone: data.ddd_telefone_1
          ? formatTelefone(`${data.ddd_telefone_1}${data.telefone_1 || ""}`)
          : "",
        email: data.email || "",
        cep: data.cep ? formatCep(data.cep) : "",
        endereco: `${data.logradouro || ""}, ${data.numero || ""}`,
        bairro: data.bairro || "",
        municipio: data.municipio || "",
        uf: data.uf || "",
        ie: "",
      }));
    } catch (error) {
      setModalError(error.message);
    } finally {
      setIsFetchingCnpj(false);
    }
  };

  const handleChange = (e) => {
    setModalError("");
    const { name, value } = e.target;
    let formattedValue = value;
    if (name === "cnpj") {
      formattedValue = formatCnpjCpf(value);
      if (formattedValue.replace(/\D/g, "").length === 14)
        handleCnpjSearch(formattedValue);
    }
    if (name === "limite_credito") {
        formattedValue = formatBRLInput(value);
    }
    setFormData((prev) => ({ ...prev, [name]: formattedValue }));
  };

  const handleUserChange = (e) => {
    const { name, value } = e.target;
    setUserData((prev) => ({ ...prev, [name]: value }));
  };

  const handleContaChange = (index, name, value) => {
    const contas = [...formData.contasBancarias];
    contas[index][name] = value;
    setFormData((prev) => ({ ...prev, contasBancarias: contas }));
  };

  const addConta = () =>
    setFormData((prev) => ({
      ...prev,
      contasBancarias: [
        ...prev.contasBancarias,
        { banco: "", agencia: "", contaCorrente: "" },
      ],
    }));
  const removeConta = (index) => {
    const contas = [...formData.contasBancarias];
    contas.splice(index, 1);
    setFormData((prev) => ({ ...prev, contasBancarias: contas }));
  };

  const handleEmailChange = (index, value) => {
    const novosEmails = [...formData.emails];
    novosEmails[index] = value;
    setFormData((prev) => ({ ...prev, emails: novosEmails }));
  };

  const addEmail = () =>
    setFormData((prev) => ({
      ...prev,
      emails: [...(formData.emails || []), ""],
    }));
  const removeEmail = (index) => {
    const novosEmails = [...formData.emails];
    novosEmails.splice(index, 1);
    setFormData((prev) => ({ ...prev, emails: novosEmails }));
  };

  const handleTipoSelection = (tipoId) => {
    setSelectedTipos((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tipoId)) newSet.delete(tipoId);
      else newSet.add(tipoId);
      return newSet;
    });
  };

  const handleSave = async (sendEmail = false) => {
    setModalError("");
    setIsSaving(true);
    const dataToSave = {
      ...formData,
      cnpj: formData.cnpj.replace(/\D/g, ""),
      fone: formData.fone?.replace(/\D/g, ""),
      cep: formData.cep?.replace(/\D/g, ""),
      limite_credito: parseBRL(formData.limite_credito),
      acesso: {
        username: userData.username,
        password: userData.password,
      },
      tiposOperacao: Array.from(selectedTipos),
      sendWelcomeEmail: sendEmail,
    };
    const result = await onSave(cliente?.id, dataToSave);
    setIsSaving(false);
    if (!result.success) setModalError(result.message);
  };

  if (!isOpen) return null;
  const isEditMode = !!cliente?.id;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col">
        <h2 className="text-xl font-bold mb-4 flex-shrink-0">
          {isEditMode ? "Editar Cliente" : "Adicionar Novo Cliente"}
        </h2>

        <div className="border-b border-gray-700 flex-shrink-0">
          <nav className="-mb-px flex space-x-6" aria-label="Tabs">
            <TabButton
              label="Dados Cadastrais"
              isActive={activeTab === "dadosCadastrais"}
              onClick={() => setActiveTab("dadosCadastrais")}
            />
            <TabButton
              label="Portal do Cliente"
              isActive={activeTab === "acesso"}
              onClick={() => setActiveTab("acesso")}
            />
            <TabButton
              label="Contas Bancárias"
              isActive={activeTab === "contas"}
              onClick={() => setActiveTab("contas")}
            />
            <TabButton
              label="Tipos de Operação"
              isActive={activeTab === "tiposOperacao"}
              onClick={() => setActiveTab("tiposOperacao")}
            />
            <TabButton
              label="Emails Notificação"
              isActive={activeTab === "emails"}
              onClick={() => setActiveTab("emails")}
            />
          </nav>
        </div>

        <div className="flex-grow overflow-y-auto py-4 pr-2">
          {activeTab === "dadosCadastrais" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300">
                    CNPJ{" "}
                    {isFetchingCnpj && (
                      <span className="text-xs text-orange-400">
                        (A consultar...)
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    name="cnpj"
                    value={formData.cnpj}
                    onChange={handleChange}
                    placeholder="Digite para buscar..."
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300">
                    Nome do Cliente
                  </label>
                  <input
                    type="text"
                    name="nome"
                    value={formData.nome || ""}
                    onChange={handleChange}
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300">
                    Ramo de Atividade
                  </label>
                  <select
                    name="ramoDeAtividade"
                    value={formData.ramoDeAtividade || ""}
                    onChange={handleChange}
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                  >
                    <option value="">Selecione...</option>
                    <option value="Transportes">Transportes</option>
                    <option value="Industria">Indústria</option>
                    <option value="Comercio">Comércio</option>
                    <option value="Servicos">Serviços</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300">
                    Inscrição Estadual
                  </label>
                  <input
                    type="text"
                    name="ie"
                    value={formData.ie || ""}
                    onChange={handleChange}
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300">
                    Telefone
                  </label>
                  <input
                    type="text"
                    name="fone"
                    value={formData.fone || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        fone: formatTelefone(e.target.value),
                      }))
                    }
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300">
                    CEP
                  </label>
                  <input
                    type="text"
                    name="cep"
                    value={formData.cep || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        cep: formatCep(e.target.value),
                      }))
                    }
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-300">
                    Endereço
                  </label>
                  <input
                    type="text"
                    name="endereco"
                    value={formData.endereco || ""}
                    onChange={handleChange}
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300">
                    Bairro
                  </label>
                  <input
                    type="text"
                    name="bairro"
                    value={formData.bairro || ""}
                    onChange={handleChange}
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-300">
                    Município
                  </label>
                  <input
                    type="text"
                    name="municipio"
                    value={formData.municipio || ""}
                    onChange={handleChange}
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300">
                    UF
                  </label>
                  <input
                    type="text"
                    name="uf"
                    value={formData.uf || ""}
                    onChange={handleChange}
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-300">
                    Email Principal
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email || ""}
                    onChange={handleChange}
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300">
                    Limite de Crédito
                  </label>
                  <input
                    type="text"
                    name="limite_credito"
                    value={formData.limite_credito || ""}
                    onChange={handleChange}
                    placeholder="R$ 0,00"
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "acesso" && (
            <div>
              <h3 className="text-md font-semibold text-gray-100 mb-2">
                Acesso ao Portal do Cliente
              </h3>
              {loadingUser ? (
                <p className="text-sm text-gray-400">
                  Carregando dados de acesso...
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-300">
                      Usuário (Login)
                    </label>
                    <input
                      type="text"
                      name="username"
                      value={userData.username}
                      onChange={handleUserChange}
                      className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-300">
                      Senha
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={userData.password}
                      onChange={handleUserChange}
                      placeholder="Preencha apenas para criar ou alterar"
                      className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "contas" && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-md font-semibold text-gray-100">
                  Contas Bancárias
                </h3>
                <button
                  type="button"
                  onClick={addConta}
                  className="text-sm font-medium text-orange-400 hover:text-orange-500 transition"
                >
                  + Adicionar
                </button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2 border border-gray-700 rounded-md p-2">
                {formData.contasBancarias?.length > 0 ? (
                  formData.contasBancarias.map((conta, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-4 gap-2 items-center"
                    >
                      <div className="col-span-2">
                        <AutocompleteInput
                          value={conta.banco}
                          onChange={(value) =>
                            handleContaChange(index, "banco", value)
                          }
                        />
                      </div>
                      <input
                        type="text"
                        name="agencia"
                        placeholder="Agência"
                        value={conta.agencia || ""}
                        onChange={(e) =>
                          handleContaChange(index, "agencia", e.target.value)
                        }
                        className="bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          name="contaCorrente"
                          placeholder="Conta"
                          value={conta.contaCorrente || ""}
                          onChange={(e) =>
                            handleContaChange(
                              index,
                              "contaCorrente",
                              e.target.value
                            )
                          }
                          className="bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm w-full"
                        />
                        <button
                          type="button"
                          onClick={() => removeConta(index)}
                          className="text-red-400 hover:text-red-500 font-bold"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-sm text-gray-400 py-3">
                    Nenhuma conta adicionada.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "tiposOperacao" && (
            <div>
              <h3 className="text-md font-semibold text-gray-100 mb-2">
                Operações Permitidas para este Cliente
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2 border border-gray-700 rounded-md p-3">
                {allTiposOperacao.length > 0 ? (
                  allTiposOperacao.map((tipo) => (
                    <label
                      key={tipo.id}
                      className="flex items-center cursor-pointer p-2 hover:bg-gray-700 rounded-md"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTipos.has(tipo.id)}
                        onChange={() => handleTipoSelection(tipo.id)}
                        className="h-4 w-4 rounded text-orange-500 bg-gray-600 border-gray-500 focus:ring-orange-500"
                      />
                      <span className="ml-3 text-sm text-gray-200">
                        {tipo.nome}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-center text-sm text-gray-400 py-3">
                    Nenhum tipo de operação cadastrado no sistema.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "emails" && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-md font-semibold text-gray-100">
                  Emails para Notificação
                </h3>
                <button
                  type="button"
                  onClick={addEmail}
                  className="text-sm font-medium text-orange-400 hover:text-orange-500 transition"
                >
                  + Adicionar
                </button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2 border border-gray-700 rounded-md p-2">
                {formData.emails?.length > 0 ? (
                  formData.emails.map((email, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="email"
                        placeholder="exemplo@email.com"
                        value={email || ""}
                        onChange={(e) =>
                          handleEmailChange(index, e.target.value)
                        }
                        className="bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm w-full"
                      />
                      <button
                        type="button"
                        onClick={() => removeEmail(index)}
                        className="text-red-400 hover:text-red-500 font-bold"
                      >
                        &times;
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-sm text-gray-400 py-3">
                    Nenhum e-mail adicionado.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {modalError && (
          <div className="text-center p-2 mt-4 bg-red-900/50 border border-red-500 rounded-md flex-shrink-0">
            <p className="text-sm text-red-300">{modalError}</p>
          </div>
        )}

        <div className="mt-6 flex justify-between border-t border-gray-700 pt-4 flex-shrink-0">
          <div>
            {isEditMode && (
              <button
                onClick={() => onDelete(cliente.id)}
                className="bg-red-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-red-700 transition text-sm"
              >
                Excluir
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition text-sm"
            >
              {isSaving ? "Salvando..." : "Salvar"}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-700 transition text-sm flex items-center gap-2"
            >
              {isSaving ? "Enviando..." : "Salvar e Enviar Boas-Vindas"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}