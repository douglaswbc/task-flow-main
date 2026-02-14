/**
 * Calcula o preço final baseado na fórmula de precificação
 * @param originalPrice - Preço original do catálogo
 * @param multiplier - Multiplicador (ex: 3)
 * @param discountPercentage - Desconto em porcentagem (ex: 35)
 * @returns Preço final calculado
 */
export const calculateFinalPrice = (
    originalPrice: number,
    multiplier: number,
    discountPercentage: number
): number => {
    const multiplied = originalPrice * multiplier;
    const discount = multiplied * (discountPercentage / 100);
    return multiplied - discount;
};

/**
    * Normaliza contatos brasileiros para o formato WhatsApp---
        * - DDD < 30: 55 + DDD + 9 + número(13 dígitos) + @s.whatsapp.net
            * - DDD >= 30: 55 + DDD + número(12 dígitos) + @s.whatsapp.net
                * @param input - Número de telefone(pode conter apenas dígitos ou já estar formatado)
                    * @returns Número normalizado no formato WhatsApp ou string vazia se inválido
                        */
export const normalizeContact = (input: string): string => {
    // Remove tudo que não é dígito
    const digitsOnly = input.replace(/\D/g, '');

    // Se já tem o sufixo @s.whatsapp.net, remove para processar
    const cleanInput = input.replace(/@s\.whatsapp\.net$/, '');
    const cleanDigits = cleanInput.replace(/\D/g, '');

    // Extrai os componentes do número
    let countryCode = '';
    let ddd = '';
    let number = '';

    // Tenta identificar o formato
    if (cleanDigits.length === 13) {
        // Formato: 55 11 9 12345678
        countryCode = cleanDigits.substring(0, 2);
        ddd = cleanDigits.substring(2, 4);
        number = cleanDigits.substring(4);
    } else if (cleanDigits.length === 12) {
        // Formato: 55 11 12345678 ou 55 31 12345678
        countryCode = cleanDigits.substring(0, 2);
        ddd = cleanDigits.substring(2, 4);
        number = cleanDigits.substring(4);
    } else if (cleanDigits.length === 11) {
        // Formato: 11 9 12345678
        countryCode = '55';
        ddd = cleanDigits.substring(0, 2);
        number = cleanDigits.substring(2);
    } else if (cleanDigits.length === 10) {
        // Formato: 11 12345678 ou 31 12345678
        countryCode = '55';
        ddd = cleanDigits.substring(0, 2);
        number = cleanDigits.substring(2);
    } else {
        // Formato inválido, retorna vazio
        return '';
    }

    // Valida se é Brasil (55)
    if (countryCode !== '55') {
        return '';
    }

    const dddNum = parseInt(ddd, 10);

    // Valida DDD (11-99)
    if (dddNum < 11 || dddNum > 99) {
        return '';
    }

    // Remove o 9 inicial se já existir para reprocessar
    if (number.startsWith('9') && number.length === 9) {
        number = number.substring(1);
    }

    // Aplica regra do DDD
    let normalizedNumber = '';
    if (dddNum < 30) {
        // DDD < 30: adiciona 9 (total 13 dígitos)
        normalizedNumber = `55${ddd}9${number}`;
    } else {
        // DDD >= 30: sem 9 (total 12 dígitos)
        normalizedNumber = `55${ddd}${number}`;
    }

    // Adiciona sufixo WhatsApp
    return `${normalizedNumber}@s.whatsapp.net`;
};
