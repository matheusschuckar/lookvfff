// ./lib/ui/helpers.ts

// É crucial importar os tipos para evitar o uso de 'any'
import type { Profile, Product } from "@/lib/data/types";

// ========================================================
// 1. Funções de Validação de Perfil (Profile Helpers)
// ========================================================

// Verifica se o perfil tem dados mínimos de contato (ex: whatsapp)
export function hasContact(profile: Profile): boolean {
  // Verifica se o campo whatsapp tem pelo menos 10 dígitos (formato E.164)
  return (profile.whatsapp?.replace(/\D/g, "").length ?? 0) >= 10;
}

// Verifica se o perfil tem os campos básicos de endereço preenchidos
export function hasAddressBasics(profile: Profile): boolean {
  // O CEP e a rua/número são os campos mais críticos para um endereço básico
  const cep = profile.cep?.replace(/\D/g, "") ?? "";
  return cep.length === 8 && !!profile.street && !!profile.number;
}

// Verifica se o endereço do perfil está dentro da área de cobertura (exemplo: São Paulo/SP)
export function inCoverage(profile: Profile): boolean {
  const city = profile.city?.trim().toLowerCase();
  const state = profile.state?.trim().toLowerCase();
  
  // Adapte esta lógica à sua regra de negócio real de cobertura
  return (
    (city === "são paulo" && state === "sp") ||
    (city === "saopaulo" && state === "sp")
  );
}


// ========================================================
// 2. Funções de Utilitários Genéricos e Listas
// ========================================================

/**
 * Checa se dois conjuntos ou arrays compartilham pelo menos um elemento.
 * Corrigido para usar Generics (`<T>`) e evitar 'any' (provavelmente a linha 25)
 */
export function intersects<T>(a: Set<T> | T[], b: Set<T> | T[]): boolean {
  // Se 'a' for um array, transforma em Set para busca O(1)
  const setA = Array.isArray(a) ? new Set(a) : a;
  const arrB = Array.isArray(b) ? b : Array.from(b);
  
  for (const item of arrB) {
    if (setA.has(item)) {
      return true;
    }
  }
  return false;
}

// Retorna todas as categorias de um produto (principal + tags/array)
export function categoriesOf(product: Product): string[] {
  const categories: Set<string> = new Set();
  
  if (product.category) {
    categories.add(product.category.toLowerCase());
  }
  
  if (Array.isArray(product.categories)) {
    product.categories.forEach((c) => categories.add(c.toLowerCase()));
  }
  
  return Array.from(categories);
}


// ========================================================
// 3. Funções de Agrupamento (Bucket Helpers)
// ========================================================

export type PriceBucket = "até R$100" | "R$100-R$300" | "R$300-R$1000" | "acima de R$1000";

/**
 * Retorna o 'bucket' (faixa) de preço de um produto.
 */
export function priceBucket(product: Product): PriceBucket | null {
  const price = product.price_tag;
  if (price <= 100) return "até R$100";
  if (price <= 300) return "R$100-R$300";
  if (price <= 1000) return "R$300-R$1000";
  if (price > 1000) return "acima de R$1000";
  return null;
}

export type EtaBucket = "1h" | "24h" | "7d";

/**
 * Retorna o 'bucket' (faixa) de tempo de entrega (ETA).
 */
export function etaBucket(product: Product): EtaBucket | null {
    // Usa 'eta_text' ou 'eta_display' para a lógica.
    const etaText = (product.eta_text || product.eta_display)?.toLowerCase();
    
    if (!etaText) return null;

    if (etaText.includes("1 hora") || etaText.includes("1h")) return "1h";
    if (etaText.includes("24 horas") || etaText.includes("24h") || etaText.includes("1 dia")) return "24h";
    if (etaText.includes("7 dias") || etaText.includes("7d") || etaText.includes("1 semana")) return "7d";

    return null;
}
