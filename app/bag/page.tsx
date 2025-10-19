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

// =====================================================
// HELPERS PIX (EMV "copia e cola")
// =====================================================

// CRC16-CCITT (0xFFFF)
function crc16(str: string) {
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
function tlv(id: string, value: string) {
  const v = value ?? "";
  const len = v.length.toString().padStart(2, "0");
  return id + len + v;
}

// Formatação BRL
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
  const router = useRouter();
  const search = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [bag, setBag] = useState<BagItem[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentStep, setCurrentStep] = useState<
    "bag" | "checkout" | "payment"
  >("bag");

  // Estados do Checkout
  const [pixCode, setPixCode] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [isPixReady, setIsPixReady] = useState(false);
  // Removido `cep` que estava não utilizado.
  // const [cep, setCep] = useState(""); // <--- CORRIGIDO: Variável 'cep' removida.

  // --- Totais ---
  const totals = useMemo(() => bagTotals(bag, DELIVERY_FEE, OPERATION_FEE), [bag]);
  const formattedTotals = useMemo(() => {
    return {
      subtotal: formatBRL(totals.subtotal),
      delivery: formatBRL(totals.delivery),
      fees: formatBRL(totals.fees),
      total: formatBRL(totals.total),
    };
  }, [totals]);

  // --- Setup ---
  useEffect(() => {
    (async () => {
      setBag(getBag());

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (profileRow) {
          // CORRIGIDO: Removido `as any` desnecessário
          const fullProfile: Profile = {
            ...profileRow,
            email: session.user.email,
          } as Profile; 
          setProfile(fullProfile);
        }
      }

      setLoading(false);
    })();
  }, []);

  // --- Handlers ---
  const updateBag = (items: BagItem[]) => {
    setBag(items);
    if (items.length === 0) {
      setCurrentStep("bag");
    }
  };

  const updateQuantity = (id: string, qty: number) => {
    updateBag(updateQty(id, qty));
  };

  const removeItem = (id: string) => {
    updateBag(removeFromBag(id));
  };

  const copyPix = async () => {
    try {
      await navigator.clipboard.writeText(pixCode);
      setOkMsg("Código PIX copiado!");
      setTimeout(() => setOkMsg(null), 2000);
    } catch {
      setErr("Erro ao copiar o código. Tente manualmente.");
    }
  };

  // --- Checkout ---
  const startCheckout = async () => {
    if (!profile) return router.push("/auth?next=/bag");
    if (!profile.street || !profile.number) return router.push("/profile");

    setCurrentStep("checkout");
  };

  const processPayment = async () => {
    setCheckoutLoading(true);
    setErr(null);
    setOkMsg(null);
    setIsPixReady(false);

    try {
      const orderData = {
        Status: "Pending PIX Payment",
        "User ID": profile!.id,
        "User Email": profile!.email,
        Name: profile!.name,
        Whatsapp: profile!.whatsapp,
        Address: `${profile!.street}, ${profile!.number} ${
          profile!.complement || ""
        }, ${profile!.bairro} - ${profile!.city}/${profile!.state} ${
          profile!.cep
        }`,
        Items: JSON.stringify(
          bag.map((item) => ({
            name: item.name,
            qty: item.qty,
            price: item.price,
            size: item.size,
            store: item.store_name,
          }))
        ),
        Subtotal: totals.subtotal,
        Delivery: totals.delivery,
        Fees: totals.fees,
        Total: totals.total,
        // Adicionais para rastreio
        StoreCount: totals.uniqueStores,
      };

      const res = await createOrder(orderData);
      const newOrderId = res.records[0].id;
      setOrderId(newOrderId);

      // --- Gera Código PIX ---
      const PIX_KEY = process.env.NEXT_PUBLIC_PIX_KEY || "";
      const PIX_MERCHANT =
        process.env.NEXT_PUBLIC_PIX_MERCHANT || "LOOK PAGAMENTOS";
      const PIX_CITY = process.env.NEXT_PUBLIC_PIX_CITY || "SAO PAULO";

      if (!PIX_KEY) throw new Error("Chave PIX não configurada.");

      let payload =
        tlv("00", "01") + // Payload Format Indicator
        tlv("01", "12") + // Point of Initiation Method: 12 (QR Estático)
        tlv("26", // Merchant Account Information (MAI)
          tlv("00", "BR.GOV.BCB.PIX") + // MAI: 00 (GUID PIX)
          tlv("01", PIX_KEY) // MAI: 01 (Chave PIX)
        ) +
        tlv("52", "0000") + // Merchant Category Code
        tlv("53", totals.total.toFixed(2)) + // Transaction Currency (BRL)
        tlv("54", totals.total.toFixed(2)) + // Transaction Amount
        tlv("58", "BR") + // Country Code
        tlv("59", PIX_MERCHANT.toUpperCase().slice(0, 25)) + // Merchant Name
        tlv("60", PIX_CITY.toUpperCase().slice(0, 15)) + // Merchant City
        tlv("62", tlv("05", newOrderId.slice(0, 25))) + // Additional Data Field: 05 (Transaction ID)
        "6304"; // CRC16

      // Calcula e anexa o CRC
      payload += crc16(payload);

      setPixCode(payload);
      setIsPixReady(true);
      setCurrentStep("payment");

      // Limpa a sacola (após a geração do pedido e PIX)
      clearBag();
      setBag([]);

    } catch (e: any) {
      setErr(e.message || "Ocorreu um erro ao processar o pagamento.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  // --- Renderização ---
  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 p-5 pt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Sua Sacola
        </h1>
        <p className="mt-1 text-sm text-neutral-500">Carregando...</p>
      </main>
    );
  }

  // Sacola vazia
  if (bag.length === 0 && currentStep !== "payment") {
    return (
      <main className="min-h-screen bg-neutral-50 p-5 pt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Sua Sacola
        </h1>
        <p className="mt-4 text-gray-600">Sua sacola está vazia.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm"
        >
          Ir para o Catálogo
        </Link>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 pb-20">
      <div className="p-5 pt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Sua Sacola
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {currentStep === "bag" && "Itens prontos para o checkout."}
          {currentStep === "checkout" && "Verifique e confirme o pedido."}
          {currentStep === "payment" && "Pagamento PIX."}
        </p>
      </div>

      {/* Passo 1: Revisão da Sacola */}
      {currentStep === "bag" && (
        <div className="px-5">
          <div className="mt-6 space-y-4">
            {bag.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 rounded-xl bg-white p-3 shadow-sm"
              >
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100 border border-neutral-200">
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>

                <div className="flex-1">
                  <p className="text-sm font-semibold line-clamp-2">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {item.store_name} • Tam: {item.size}
                  </p>
                  <p className="text-sm font-semibold mt-1">
                    {formatBRL(item.price)}
                  </p>
                </div>

                <div className="flex flex-col items-end justify-between">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.id, item.qty - 1)}
                      disabled={item.qty <= 1}
                      className="btn-sq-sm"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="text-sm w-5 text-center">{item.qty}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.qty + 1)}
                      className="btn-sq-sm"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-1 rounded-xl bg-white p-4 shadow-sm">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium">{formattedTotals.subtotal}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Taxas ({totals.uniqueStores}{" "}
                {totals.uniqueStores > 1 ? "lojas" : "loja"})
              </span>
              <span className="font-medium">{formattedTotals.fees}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Frete</span>
              <span className="font-medium">{formattedTotals.delivery}</span>
            </div>
            <div className="flex justify-between pt-2 border-t mt-2">
              <span className="text-base font-semibold">Total</span>
              <span className="text-lg font-bold text-black">
                {formattedTotals.total}
              </span>
            </div>
          </div>

          <button
            onClick={startCheckout}
            className="mt-6 w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-md transition active:scale-[0.99]"
          >
            {profile ? "Ir para o Checkout" : "Entrar para Comprar"}
          </button>
        </div>
      )}

      {/* Passo 2: Confirmação do Checkout */}
      {currentStep === "checkout" && profile && (
        <div className="px-5 mt-6">
          <div className="space-y-4">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-2">Resumo do Pedido</h3>
              <div className="space-y-1 text-sm text-gray-700">
                <div className="flex justify-between">
                  <span>Itens ({bag.length})</span>
                  <span>{formattedTotals.subtotal}</span>
                </div>
                <div className="flex justify-between">
                  <span>Frete/Taxas</span>
                  <span>{formatBRL(totals.delivery + totals.fees)}</span>
                </div>
              </div>
              <div className="flex justify-between pt-2 border-t mt-2">
                <span className="text-base font-semibold">Total a Pagar</span>
                <span className="text-lg font-bold text-black">
                  {formattedTotals.total}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-2 flex justify-between">
                <span>Entrega</span>
                <Link href="/profile" className="text-xs text-blue-600 underline">
                  Alterar
                </Link>
              </h3>
              <p className="text-sm text-gray-700">
                {profile.name} ({profile.whatsapp})
              </p>
              <p className="text-sm text-gray-700">
                {profile.street}, {profile.number} {profile.complement}
              </p>
              <p className="text-sm text-gray-700">
                {profile.bairro}, {profile.city}-{profile.state} {profile.cep}
              </p>
            </div>
          </div>

          <button
            onClick={processPayment}
            disabled={checkoutLoading}
            className="mt-6 w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-md transition active:scale-[0.99] disabled:opacity-60"
          >
            {checkoutLoading ? (
              <Loader2 className="animate-spin inline-block mr-2 h-5 w-5" />
            ) : (
              "Confirmar e Gerar PIX"
            )}
          </button>
        </div>
      )}

      {/* Passo 3: Pagamento PIX */}
      {currentStep === "payment" && (
        <div className="px-5 mt-6">
          <div className="rounded-xl bg-white p-4 shadow-sm text-center">
            <h3 className="text-xl font-bold text-black mb-1">
              {formattedTotals.total}
            </h3>
            <p className="text-sm text-gray-700 mb-3">
              Pedido **{orderId}** criado com sucesso.
            </p>

            {isPixReady ? (
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
                <div className="mt-3">
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
                      className="rounded-lg bg-black text-white px-3 py-2 text-sm font-semibold flex items-center justify-center gap-2"
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
            Sua Sacola
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Carregando...</p>
        </main>
      }
    >
      <BagPageInner />
    </Suspense>
  );
}
