export const normalizeDocumentoNumero = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

export const buildDuplicataIdentifiers = (nfCte, parcelasCalculadas = []) => {
  const documento = normalizeDocumentoNumero(nfCte);
  if (!documento) return [];

  const parcelas = Array.isArray(parcelasCalculadas) ? parcelasCalculadas : [];
  const identifiers = parcelas
    .map((parcela) => {
      const numeroParcela = parcela?.numeroParcela ?? parcela?.numero ?? parcela?.parcela;
      if (numeroParcela === null || numeroParcela === undefined || numeroParcela === '') return null;
      return `${documento}.${String(numeroParcela).trim()}`;
    })
    .filter(Boolean);

  if (identifiers.length === 0) {
    return [`${documento}.1`];
  }

  return [...new Set(identifiers)];
};

export const collectDuplicataIdentifiers = (notasFiscais = []) => {
  const identifiers = notasFiscais.flatMap((notaFiscal) =>
    buildDuplicataIdentifiers(notaFiscal?.nfCte, notaFiscal?.parcelasCalculadas)
  );

  return [...new Set(identifiers)];
};

export const findRepeatedValues = (values = []) => {
  const seen = new Set();
  const repeated = new Set();

  for (const value of values) {
    const normalized = normalizeDocumentoNumero(value);
    if (!normalized) continue;

    if (seen.has(normalized)) {
      repeated.add(normalized);
    } else {
      seen.add(normalized);
    }
  }

  return [...repeated];
};

const normalizeSacado = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLocaleLowerCase('pt-BR');
};

export const findRepeatedDuplicatas = (duplicatas = []) => {
  const keys = duplicatas.map((duplicata) =>
    `${normalizeDocumentoNumero(duplicata?.nfCte ?? duplicata?.nf_cte)}::${normalizeSacado(
      duplicata?.sacadoId ?? duplicata?.sacado_id ?? duplicata?.clienteSacado ?? duplicata?.cliente_sacado
    )}`
  );
  return findRepeatedValues(keys).map((key) => key.split('::')[0]);
};

export const queryDuplicatasByIdentifiers = async (
  supabase,
  identifiers = [],
  { clienteId = null, excludeOperacaoId = null, sacadoId = null } = {}
) => {
  const uniqueIdentifiers = [...new Set(identifiers.map(normalizeDocumentoNumero).filter(Boolean))];

  if (uniqueIdentifiers.length === 0) {
    return [];
  }

  let query = supabase
    .from('duplicatas')
    .select('id, nf_cte, operacao_id, cliente_sacado, sacado_id, data_operacao, status_recebimento, operacao:operacoes!inner(cliente_id)');

  if (excludeOperacaoId !== null && excludeOperacaoId !== undefined && excludeOperacaoId !== '') {
    query = query.neq('operacao_id', excludeOperacaoId);
  }

  if (clienteId !== null && clienteId !== undefined && clienteId !== '') {
    query = query.eq('operacao.cliente_id', clienteId);
  }

  if (sacadoId !== null && sacadoId !== undefined && sacadoId !== '') {
    query = query.eq('sacado_id', sacadoId);
  }

  const { data, error } = await query.in('nf_cte', uniqueIdentifiers);

  if (error) throw error;

  return data || [];
};

export const queryDuplicatasByEntries = async (
  supabase,
  duplicatas = [],
  options = {}
) => {
  const identifiers = duplicatas.map((item) => item?.nfCte ?? item?.nf_cte);
  const candidates = await queryDuplicatasByIdentifiers(supabase, identifiers, options);

  return candidates.filter((candidate) => duplicatas.some((item) => {
    const identifier = normalizeDocumentoNumero(item?.nfCte ?? item?.nf_cte);
    if (identifier !== normalizeDocumentoNumero(candidate.nf_cte)) return false;

    const requestedId = normalizeSacado(item?.sacadoId ?? item?.sacado_id);
    const candidateId = normalizeSacado(candidate.sacado_id);
    if (requestedId && candidateId) return requestedId === candidateId;

    return normalizeSacado(item?.clienteSacado ?? item?.cliente_sacado) ===
      normalizeSacado(candidate.cliente_sacado);
  }));
};

export const formatDuplicataConflictMessage = (conflicts = [], repeatedInPayload = []) => {
  const conflictedDocs = [...new Set(conflicts.map((item) => item.nf_cte))];
  const repeatedDocs = [...new Set(repeatedInPayload)];

  const parts = [];

  if (conflictedDocs.length > 0) {
    parts.push(`documento(s) já operado(s): ${conflictedDocs.join(', ')}`);
  }

  if (repeatedDocs.length > 0) {
    parts.push(`documento(s) repetido(s) no mesmo envio: ${repeatedDocs.join(', ')}`);
  }

  return parts.length > 0
    ? `Não foi possível concluir a operação. ${parts.join('; ')}.`
    : 'Não foi possível concluir a operação porque há duplicidade de NF/CT-e.';
};
