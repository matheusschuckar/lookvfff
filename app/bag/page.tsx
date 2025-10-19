// app/bag/page.tsx
"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getBag,
  updateQty,
  removeFromBag,
  bagTotals,
  BagItem,
  clearBag,
} from "@/lib/bag";
import { createOrder } from "@/lib/airtableClient";
import BottomNav from "@/components/BottomNav";
import { Trash2, Loader2, Minus, Plus, Copy } from "lucide-react"; // Adicionado ícones

// Constantes
const DELIVERY_FEE = 20; // frete por loja
const OPERATION_FEE = 3.4; // taxa fixa por pedido

// =====================================================
// TIPAGEM
// =====================================================

type ProfileRow = {
  id: string;
  name: string | null;
  whatsapp: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  bairro: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  cpf: string | null;
};

type Profile = {
  id: string;
  email: string | null;
  name: string | null;
  whatsapp: string | null; // E.164 sem '+'
  street: string | null;
  number: string | null;
  complement: string | null;
  bairro: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  cpf: string | null;
};

type Step = "review" | "confirm" | "pix";

// =====================================================
// HELPERS PIX (EMV "copia e cola")
// =====================================================

// CRC16-CCITT (0xFFFF)
function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// TLV (ID + len + value)
function tlv(id: string, value: string): string {
  const v = value ?? "";
  const len = v.length.toString().padStart(2, "0");
  return `${id}${len}${v}`;
}

/** Gera payload EMV PIX estático com valor. */
function buildPix({
  key,
  merchant,
  city,
  amount,
  txid = "LOOKMVP",
}: {
  key: string;
  merchant: string;
  city: string;
  amount: number;
  txid?: string;
}): string {
  const id00 = tlv("00", "01"); // Payload Format
  const id01 = tlv("01", "11"); // Static
  const gui = tlv("00", "br.gov.bcb.pix");
  const k = tlv("01", key.trim());
  const id26 = tlv("26", gui + k); // Merchant Account Info - PIX
  const id52 = tlv("52", "0000");
  const id53 = tlv("53", "986"); // BRL
  const id54 = tlv("54", amount.toFixed(2));
  const id58 = tlv("58", "BR");
  const id59 = tlv("59", merchant.substring(0, 25));
  const id60 = tlv("60", city.substring(0, 15));
  const id62 = tlv("62", tlv("05", txid.substring(0, 25)));
  const partial =
    id00 +
    id01 +
    id26 +
    id52 +
    id53 +
    id54 +
    id58 +
    id59 +
    id60 +
    id62 +
    "6304";
  const crc = crc16(partial);
  return partial + crc;
}

// =====================================================
// HELPERS DE VALIDAÇÃO E ENDEREÇO
// =====================================================

function onlyDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}
function cepValid(cep: string): boolean {
  return onlyDigits(cep).length === 8;
}

async function fetchAddress(cep: string): Promise<{
  street: string;
  neighborhood: string;
  city: string;
  uf: string;
} | null> {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!res.ok) return null;
    const data: {
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
      erro?: boolean;
    } = await res.json();
    if (data?.erro) return null;
    return {
      street: data.logradouro || "",
      neighborhood: data.bairro || "",
      city: data.localidade || "",
      uf: (data.uf || "").toUpperCase(),
    };
  } catch {
    return null;
  }
}

// CIDADES ATENDIDAS: Apenas cidade de São Paulo (SP).
const SERVICEABLE = [{ uf: "SP", city: "São Paulo" }];

function normalize(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isServiceable(uf: string, city: string, cep?: string): boolean {
  const nUF = (uf || "").toUpperCase();
  const nCity = normalize(city || "");
  return SERVICEABLE.some((c) => c.uf === nUF && normalize(c.city) === nCity);
}

function serviceabilityMsg(uf: string, city: string): string {
  return `Infelizmente ainda não atendemos ${
    city || "(cidade não informada)"
  }, ${
    uf || "UF"
  }. Por enquanto entregamos apenas na cidade de São Paulo (SP).`;
}

// Formatador BRL
function formatBRL(v?: number) {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(v ?? 0);
  } catch {
    return `R$ ${(v ?? 0).toFixed(2)}`;
  }
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

function BagPageInner() {
  const [items, setItems] = useState<BagItem[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [creatingFor, setCreatingFor] = useState<null | "pix" | "card">(null);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const router = useRouter();
  const search = useSearchParams();

  // controle de etapas
  const [step, setStep] = useState<Step>("review");

  // estado de edição de endereço (inicialmente copia do perfil)
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState(""); // bairro
  const [stateUf, setStateUf] = useState("SP");
  const [city, setCity] = useState("");
  const [cep, setCep] = useState("");

  // PIX mostrado após criar pedido
  const [pixCode, setPixCode] = useState<string | null>(null);

  // pode pagar? depende de endereço atendido e não estar processando
  const canCheckout =
    isServiceable(stateUf, city, cep) && creatingFor === null;

  // carrega itens da sacola
  useEffect(() => {
    setItems(getBag());
  }, []);

  // carrega usuário + perfil
  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const user = u?.user;
        if (!user) return;

        const { data: p, error } = await supabase
          .from("user_profiles")
          .select(
            "id,name,whatsapp,street,number,complement,bairro,city,state,cep,cpf"
          )
          .eq("id", user.id)
          .single<ProfileRow>();

        if (error) throw error;
        if (!p) return;

        const prof: Profile = {
          id: user.id,
          email: user.email || null,
          name: p.name ?? null,
          whatsapp: p.whatsapp ?? null,
          street: p.street ?? null,
          number: p.number ?? null,
          complement: p.complement ?? null,
          bairro: p.bairro ?? null,
          city: p.city ?? null,
          state: p.state ?? null,
          cep: p.cep ?? null,
          cpf: p.cpf ?? null,
        };
        setProfile(prof);

        // preenche o formulário de endereço com o perfil
        setStreet(prof.street ?? "");
        setNumber(prof.number ?? "");
        setComplement(prof.complement ?? "");
        setNeighborhood(prof.bairro ?? "");
        setCity(prof.city ?? "");
        setStateUf(prof.state ?? "SP");
        setCep(prof.cep ?? "");
      } catch (e) {
        const errorMsg =
          e instanceof Error ? e.message : "Erro desconhecido ao carregar perfil";
        setErr(errorMsg);
      }
    })();
  }, []);

  // Auto-preencher endereço quando CEP atingir 8 dígitos
  useEffect(() => {
    const digits = onlyDigits(cep);
    if (digits.length === 8) {
      fetchAddress(digits).then((addr) => {
        if (!addr) return;
        setStreet(addr.street);
        setNeighborhood(addr.neighborhood);
        setCity(addr.city);
        if (addr.uf) setStateUf(addr.uf);
      });
    }
  }, [cep]);

  // Se veio com ?checkout=1, exige login antes de abrir a confirmação
  useEffect(() => {
    const wantsCheckout = search?.get("checkout") === "1";
    if (!wantsCheckout) return;
    if (items.length === 0) return;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        router.replace(`/auth?next=${encodeURIComponent("/bag?checkout=1")}`);
        return;
      }
      setStep("confirm");
    })();
  }, [search, items.length, router]);

  // Totais e Frete
  const { subtotal } = bagTotals(items);
  const uniqueStores = useMemo(
    () => Array.from(new Set(items.map((it) => it.store_name))),
    [items]
  );
  const delivery = items.length > 0 ? DELIVERY_FEE * uniqueStores.length : 0;
  const opFee = items.length > 0 ? OPERATION_FEE : 0;
  const total = items.length > 0 ? subtotal + delivery + opFee : 0;

  // salva o endereço EDITADO no user_profiles (oficial)
  async function saveAddressToProfile() {
    if (!profile?.id) return;
    if (!cepValid(cep)) {
      throw new Error("CEP inválido. Use 8 dígitos.");
    }
    if (
      !street.trim() ||
      !number.trim() ||
      !neighborhood.trim() ||
      !city.trim()
    ) {
      throw new Error("Preencha rua, número, bairro e cidade.");
    }

    // TIPAGEM: O payload deve corresponder à estrutura de ProfileRow
    const payload: Partial<ProfileRow> = {
      id: profile.id,
      street: street.trim(),
      number: number.trim(),
      complement: (complement || "").trim(),
      bairro: neighborhood.trim(),
      city: city.trim(),
      state: (stateUf || "SP").toUpperCase(),
      cep: onlyDigits(cep),
    };

    const { error } = await supabase
      .from("user_profiles")
      .upsert(payload as ProfileRow, { onConflict: "id" });

    if (error) throw error;

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            street: payload.street ?? prev.street,
            number: payload.number ?? prev.number,
            complement: payload.complement ?? prev.complement,
            bairro: payload.bairro ?? prev.bairro,
            city: payload.city ?? prev.city,
            state: payload.state ?? prev.state,
            cep: payload.cep ?? prev.cep,
          }
        : prev
    );
  }

  // Ao continuar, exige estar logado; se não, vai para /auth e volta ao /bag?checkout=1
  async function handleContinue() {
    const { data } = await supabase.auth.getUser();
    const logged = !!data?.user;
    if (!logged) {
      router.replace(`/auth?next=${encodeURIComponent("/bag?checkout=1")}`);
      return;
    }
    setStep("confirm");
  }

  // Finaliza a compra (chamado pelo botão PIX ou Cartão)
  async function handleCheckout(method: "pix" | "card") {
    try {
      setCreatingFor(method);
      setErr(null);
      setOkMsg(null);

      if (items.length === 0) {
        setErr("Sua sacola está vazia.");
        return;
      }

      // 1) BLOQUEIO POR REGIÃO
      if (!isServiceable(stateUf, city, cep)) {
        setErr(serviceabilityMsg(stateUf, city));
        setStep("confirm");
        return;
      }

      // 2) Sessão/e-mail
      const { data: u } = await supabase.auth.getUser();
      const sessionUser = u?.user ?? null;
      if (!sessionUser) {
        router.replace(
          `/auth?next=${encodeURIComponent("/bag?checkout=1#pix")}`
        );
        return;
      }

      // 3) Garante que o endereço mais atualizado foi salvo
      await saveAddressToProfile();

      // 4) Mapeia os itens para o formato do Airtable
      const airtableItems = items.map((it) => ({
        id: it.id,
        name: it.name,
        price: it.price,
        qty: it.qty,
        store_name: it.store_name,
        photo_url: it.photo_url,
      }));

      const airtablePayload = {
        Status: method === "pix" ? "Aguardando Pagamento" : "Aguardando Cartão",
        Total: total,
        Subtotal: subtotal,
        Frete: delivery,
        Taxa: opFee,
        Itens: JSON.stringify(airtableItems),
        ItensCount: items.length,

        // Dados do Usuário
        UserEmail: sessionUser.email,
        UserName: profile?.name,
        UserWhatsapp: profile?.whatsapp,
        UserCPF: profile?.cpf,

        // Endereço de Entrega (do state/editável)
        Rua: street.trim(),
        Numero: number.trim(),
        Complemento: complement.trim(),
        Bairro: neighborhood.trim(),
        Cidade: city.trim(),
        UF: stateUf.toUpperCase(),
        CEP: onlyDigits(cep),
        // Notas (opcional)
        Notes: `Via App Look - ${method.toUpperCase()}`,
      };

      // 5) Cria o pedido no Airtable
      const order = await createOrder(airtablePayload);
      const airtableId = order?.id;

      if (!airtableId) {
        throw new Error("Erro ao criar o pedido. Tente novamente.");
      }

      // 6) Lógica específica para PIX
      if (method === "pix") {
        const pixKey = process.env.NEXT_PUBLIC_PIX_KEY;
        const pixMerchant = process.env.NEXT_PUBLIC_PIX_MERCHANT;

        if (!pixKey || !pixMerchant) {
          throw new Error("Configurações PIX não encontradas.");
        }

        const pix = buildPix({
          key: pixKey,
          merchant: pixMerchant,
          city: city.trim() || "SAO PAULO", // Fallback seguro
          amount: total,
          txid: airtableId.slice(-10), // Usar parte do ID do Airtable como TXID
        });

        setPixCode(pix);
        setStep("pix");
        setOkMsg("Pedido criado com sucesso! Use o PIX abaixo para pagar.");
      } else {
        // Lógica de redirecionamento para gateway de cartão (simulado)
        setOkMsg(
          "Pedido criado. Você será redirecionado para o pagamento com cartão."
        );
        // Simulação de redirecionamento, na realidade, seria para um link de gateway.
        setTimeout(() => {
          router.replace(`/orders/${airtableId}?status=card_pending`);
          clearBag(); // Limpa a sacola após o checkout
        }, 1000);
      }

      clearBag(); // Limpa a sacola após o checkout (mesmo para PIX)
    } catch (e) {
      const errorMsg =
        e instanceof Error
          ? e.message
          : "Erro desconhecido ao finalizar o pedido.";
      setErr(errorMsg);
      setCreatingFor(null);
    }
  }

  // Função para copiar o código PIX
  async function copyPix() {
    if (!pixCode) return;
    try {
      await navigator.clipboard.writeText(pixCode);
      setOkMsg("Código PIX copiado!");
    } catch {
      setErr("Não foi possível copiar. Por favor, selecione e copie manualmente.");
    }
  }

  // =====================================================
  // RENDERIZAÇÃO
  // =====================================================

  if (items.length === 0 && step !== "pix") {
    return (
      <main className="min-h-screen bg-neutral-50 p-5 pt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Your Bag
        </h1>
        <div className="mt-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <p className="text-gray-600">Sua sacola está vazia.</p>
          <Link
            href="/"
            className="mt-4 block w-full rounded-xl bg-black px-4 py-3 text-center text-sm font-semibold text-white shadow-sm transition active:scale-[0.99]"
          >
            Start Shopping
          </Link>
        </div>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="canvas max-w-md mx-auto min-h-screen pb-24">
      {/* Header */}
      <div className="pt-6 px-5 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          {step === "review" ? "Your Bag" : "Checkout"}
        </h1>
        {step === "confirm" && (
          <button
            onClick={() => setStep("review")}
            className="text-sm text-neutral-600 underline"
          >
            Edit Bag
          </button>
        )}
      </div>

      {/* Passo 1: Revisão da Sacola (review) */}
      {step === "review" && (
        <div className="mt-6 px-5 space-y-6">
          {/* Lista de Itens */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Items ({items.length})</h2>
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5 space-y-4">
              {items.map((item, i) => (
                <div key={i} className="flex items-center space-x-4 border-b pb-4 last:border-b-0 last:pb-0">
                  {/* Imagem */}
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                    {item.photo_url ? (
                      <img
                        src={
                          Array.isArray(item.photo_url)
                            ? item.photo_url[0]
                            : item.photo_url
                        }
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-neutral-400">
                        👜
                      </div>
                    )}
                  </div>

                  {/* Detalhes */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">
                      {item.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {item.store_name}
                    </p>
                    <p className="text-xs font-semibold text-neutral-800 mt-1">
                      {formatBRL(item.price)}
                    </p>
                  </div>

                  {/* Qtd e Remover */}
                  <div className="flex flex-col items-end space-y-1">
                    <button
                      onClick={() => setItems(removeFromBag(item.id))}
                      className="text-neutral-500 hover:text-red-500 transition-colors"
                      title="Remover item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="flex items-center rounded-full border border-neutral-200 bg-neutral-50">
                      <button
                        onClick={() =>
                          setItems(updateQty(item.id, Math.max(1, item.qty - 1)))
                        }
                        disabled={item.qty <= 1}
                        className="p-1.5 text-neutral-600 disabled:opacity-30"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center text-xs font-medium">
                        {item.qty}
                      </span>
                      <button
                        onClick={() => setItems(updateQty(item.id, item.qty + 1))}
                        className="p-1.5 text-neutral-600"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    clearBag();
                    setItems([]);
                  }}
                  className="text-xs text-red-600 underline"
                >
                  Clear Bag
                </button>
              </div>
            </div>
          </section>

          {/* Resumo de Custos */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Summary</h2>
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-600">Subtotal</span>
                <span className="font-medium">{formatBRL(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Delivery ({uniqueStores.length} stores)</span>
                <span className="font-medium">{formatBRL(delivery)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Service Fee</span>
                <span className="font-medium">{formatBRL(opFee)}</span>
              </div>
              <div className="pt-3 flex justify-between border-t border-neutral-100 mt-3 font-semibold text-lg">
                <span>Total</span>
                <span>{formatBRL(total)}</span>
              </div>
            </div>
          </section>

          {/* Botão de Checkout */}
          <button
            onClick={handleContinue}
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60 mt-4"
            disabled={items.length === 0}
          >
            Continue to Checkout
          </button>
        </div>
      )}

      {/* Passo 2: Confirmação e Endereço (confirm) */}
      {step === "confirm" && (
        <div className="mt-6 px-5 space-y-6">
          <h2 className="text-xl font-semibold">Delivery Address</h2>

          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 space-y-4">
            {/* Endereço Form */}
            <div className="space-y-3">
              {/* CEP */}
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-800">
                  CEP
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  maxLength={9}
                  placeholder="00000-000"
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              {/* Rua */}
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-800">
                  Street
                </label>
                <input
                  type="text"
                  required
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Rua, Avenida, etc."
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              {/* Número e Complemento */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-neutral-800">
                    Number
                  </label>
                  <input
                    type="text"
                    required
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="100"
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-neutral-800">
                    Complement (Optional)
                  </label>
                  <input
                    type="text"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    placeholder="Apto 101"
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              </div>

              {/* Bairro, Cidade, UF */}
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-800">
                    Neighborhood
                  </label>
                  <input
                    type="text"
                    required
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    placeholder="Bairro"
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-neutral-800">
                      City
                    </label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Cidade"
                      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-black/10"
                    />
                  </div>
                  <div className="w-20">
                    <label className="mb-1 block text-sm font-medium text-neutral-800">
                      UF
                    </label>
                    <input
                      type="text"
                      required
                      value={stateUf}
                      onChange={(e) => setStateUf(e.target.value.toUpperCase())}
                      maxLength={2}
                      placeholder="SP"
                      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-black/10 uppercase"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Mensagem de Serviceability */}
            {!isServiceable(stateUf, city, cep) && (
              <p className="mt-2 text-sm text-red-600">
                {serviceabilityMsg(stateUf, city)}
              </p>
            )}

            {err && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </p>
            )}

            {/* Opções de Pagamento */}
            <div className="space-y-2 pt-4 border-t">
              <h3 className="text-lg font-semibold">Payment Method</h3>
              <p className="text-sm text-neutral-600">Total: <span className="font-bold text-black">{formatBRL(total)}</span></p>

              <button
                onClick={() => handleCheckout("pix")}
                disabled={!canCheckout || creatingFor !== null}
                className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60 flex items-center justify-center space-x-2"
              >
                {creatingFor === "pix" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing PIX…</span>
                  </>
                ) : (
                  <span>Pay with PIX</span>
                )}
              </button>

              <button
                onClick={() => handleCheckout("card")}
                disabled={!canCheckout || creatingFor !== null}
                className="w-full rounded-xl border border-black bg-white px-4 py-3 text-sm font-semibold text-black shadow-sm transition active:scale-[0.99] disabled:opacity-60 flex items-center justify-center space-x-2"
              >
                {creatingFor === "card" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing Card…</span>
                  </>
                ) : (
                  <span>Pay with Card</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Passo 3: PIX Gerado (pix) */}
      {step === "pix" && (
        <div className="mt-6 px-5">
          <h2 className="text-xl font-semibold">Payment with PIX</h2>
          <div className="mt-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 space-y-4 text-center">
            <h3 className="text-lg font-bold text-black">
              Total: {formatBRL(total)}
            </h3>

            {pixCode ? (
              <>
                <p className="text-xs text-gray-700 mb-3">
                  Use o QR abaixo ou copie o código para pagar.
                </p>
                <div className="flex justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                      pixCode
                    )}`}
                    alt="QR Code PIX"
                    className="rounded-lg"
                  />
                </div>
                <div className="mt-3 text-left">
                  <label className="text-xs text-gray-600">
                    Copia e cola PIX
                  </label>
                  <textarea
                    className="w-full rounded-md border p-2 text-xs"
                    rows={4}
                    readOnly
                    value={pixCode}
                  />
                  <div className="mt-2 flex flex-col space-y-2">
                    <button
                      onClick={copyPix}
                      className="rounded-lg bg-black text-white px-3 py-2 text-sm font-semibold flex items-center justify-center space-x-2"
                    >
                      <Copy className="h-4 w-4" />
                      <span>Copiar código</span>
                    </button>
                    <Link
                      href="/orders"
                      className="rounded-lg border px-3 py-2 text-sm text-center text-neutral-700"
                    >
                      Acesse seus pedidos
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-600">Gerando PIX…</p>
            )}

            <p className="text-[11px] text-gray-500 mt-3 border-t pt-3">
              Recebedor:{" "}
              {(
                process.env.NEXT_PUBLIC_PIX_MERCHANT || "LOOK PAGAMENTOS"
              ).toUpperCase()}{" "}
              — Chave: {process.env.NEXT_PUBLIC_PIX_KEY || "(não definida)"}
            </p>
            {okMsg && <p className="text-xs text-green-700 mt-2">{okMsg}</p>}
            {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}

export default function BagPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-50 p-5 pt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            Your Bag
          </h1>
          <p className="mt-1 text-sm text-neutral-600">Loading…</p>
        </main>
      }
    >
      <BagPageInner />
    </Suspense>
  );
}
