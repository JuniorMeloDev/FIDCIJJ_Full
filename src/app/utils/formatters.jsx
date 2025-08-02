export const formatBRLInput = (value) => {
    if (!value) return '';
    const cleanValue = String(value).replace(/\D/g, ''); // Remove tudo que não é dígito
    if (cleanValue === '') return '';
    const numberValue = Number(cleanValue) / 100;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numberValue);
};

export const parseBRL = (value) => {
    if (!value) return 0;
    const numberString = String(value).replace(/\D/g, '');
    if (numberString === '') return 0;
    return parseFloat(numberString) / 100;
};

export const formatBRLNumber = (value) => {
    const number = typeof value === 'number' ? value : 0;
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const formatBRLForAxis = (value) => {
    if (value >= 1000000) {
        return `R$ ${(value / 1000000).toFixed(1).replace('.', ',')}M`;
    }
    if (value >= 1000) {
        return `R$ ${(value / 1000).toFixed(0)}k`;
    }
    return `R$ ${value}`;
};

export const formatTelefone = (value) => {
    if (!value) return '';
    let cleanValue = String(value).replace(/\D/g, '');
    
    // Remove o código do país "55" se estiver no início
    if (cleanValue.startsWith('55')) {
        cleanValue = cleanValue.substring(2);
    }
    
    // Limita o tamanho para DDD + 9 dígitos
    cleanValue = cleanValue.slice(0, 11);

    if (cleanValue.length > 10) {
        // Formato (XX) XXXXX-XXXX
        return cleanValue.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (cleanValue.length > 6) {
        // Formato (XX) XXXX-XXXX
        return cleanValue.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    } else if (cleanValue.length > 2) {
        return cleanValue.replace(/(\d{2})(\d*)/, '($1) $2');
    }
    return cleanValue;
};

export const formatCnpjCpf = (value) => {
    if (!value) return '';
    const cleanValue = String(value).replace(/\D/g, '');

    if (cleanValue.length <= 11) {
        // Formato CPF: XXX.XXX.XXX-XX
        return cleanValue
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    
    // Formato CNPJ: XX.XXX.XXX/XXXX-XX
    return cleanValue
        .slice(0, 14)
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
};

export const formatCep = (value) => {
    if (!value) return '';
    return String(value)
        .replace(/\D/g, '')
        .slice(0, 8)
        .replace(/(\d{5})(\d)/, '$1-$2');
};

export const formatDate = (dateString) => {
    if (!dateString) return '-';
    if (dateString.includes('T')) {
        dateString = dateString.split('T')[0];
    }
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
};