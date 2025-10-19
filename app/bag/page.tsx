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
import { Trash2, Loader2, Minus, Plus, Copy } from "lucide-react";

// Constantes
const DELIVERY_FEE = 20; // frete por loja
const OPERATION_FEE = 3.4; // taxa fixa por pedido

// =====================================================
// TIPAGEM
// =====================================================

// REMOVIDA: type ProfileRow (Estava causando o erro de variável não usada)

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

// NOVO: Type para a resposta do Airtable para remover o erro 'any'
// Assume que o campo 'Pix Code' é uma string.
type AirtableOrderResponse = {
  records: Array<{
    id: string;
    fields: { "Pix Code"?: string; Status?: string; }; 
  }>;
};

// =====================================================
// Helpers PIX (EMV "copia e cola")
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

function generatePix(data: string) {
  if (!data) return "";
  const pixData =
    // Payload Format Indicator (00)
    tlv("00", "01") +
    // Point of Initiation Method (01)
    tlv("01", "11") + // 11 = QR Code estático (pagamento único)
    // Merchant Account Information (26)
    tlv("26", `0014br.gov.bcb.pix${tlv("05", data)}`) +
    // Merchant Category Code (52)
    tlv("52", "0000") +
    // Transaction Currency (53)
    tlv("53", "986") + // 986 = BRL
    // Country Code (58)
    tlv("58", "BR") +
    // Merchant Name (59)
    tlv("59", (process.env.NEXT_PUBLIC_PIX_MERCHANT || "LOOK PAGAMENTOS").substring(0, 25)) +
    // Merchant City (60)
    tlv("60", (process.env.NEXT_PUBLIC_PIX_CITY || "SAO PAULO").substring(0, 15)) +
    // Additional Data Field Template (62) - optional
    tlv("62", tlv("05", "LOOK-ORDER")); // reference

  const finalPix = pixData + "6304"; // Tag para CRC16
  return finalPix + crc16(finalPix);
}

function formatBRL(v?: number) {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(v ?? 0);
  } catch {
    return `R$ ${(v ?? 0).toFixed(2).replace(".", ",")}`;
  }
}

// =====================================================
// Componente Principal
// =====================================================

function BagInner() {
  const router = useRouter();
  const _search = useSearchParams(); // CORRIGIDO: Renomeado para _search

  const [bag, setBag] = useState<BagItem[]>([]);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Estados do checkout/pagamento
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState<string | null>(null);

  // Efeitos e Cálculos
  useEffect(() => {
    // 1. Carrega sacola
    setBag(getBag());
    
    // 2. Tenta carregar usuário e perfil
    (async () => {
      setLoading(true);
      const { data: userSess, error: userErr } =
        await supabase.auth.getSession();
      
      const loggedUser = userSess.session?.user;
      setUser(loggedUser);

      if (!loggedUser) {
        setLoading(false);
        // Redireciona para login se não estiver logado
        // router.replace("/auth?next=/bag"); 
        return;
      }

      // 3. Carrega Perfil do Supabase
      const { data: profileRes } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", loggedUser.id)
        .single();

      if (profileRes) {
        setProfile({
          id: loggedUser.id,
          email: loggedUser.email,
          name: profileRes.name,
          whatsapp: profileRes.whatsapp,
          street: profileRes.street,
          number: profileRes.number,
          complement: profileRes.complement,
          bairro: profileRes.bairro,
          city: profileRes.city,
          state: profileRes.state,
          cep: profileRes.cep,
          cpf: profileRes.cpf,
        });
      }

      setLoading(false);
    })();
  }, []);

  const totals = useMemo(() => bagTotals(bag, DELIVERY_FEE, OPERATION_FEE), [bag]);
  const isReadyToCheckout = !!profile?.street && !!profile?.whatsapp;
  const deliveryReady = totals.delivery > 0;

  // Handlers
  const handleUpdateQty = (itemId: string, qty: number) => {
    updateQty(itemId, qty);
    setBag(getBag()); // Recarrega para refletir a mudança
  };

  const handleRemove = (itemId: string) => {
    removeFromBag(itemId);
    setBag(getBag());
  };

  const handleCheckout = async () => {
    if (!isReadyToCheckout || isCheckingOut || bag.length === 0 || !user || !profile) return;

    setIsCheckingOut(true);
    setErr(null);
    setOkMsg(null);
    
    // Constrói os campos do pedido para o Airtable
    const orderFields = {
      // Dados do Usuário
      "User ID": user.id,
      "User Email": user.email,
      "User Name": profile.name || user.email,
      Whatsapp: profile.whatsapp,
      CPF: profile.cpf,

      // Dados do Endereço
      Street: `${profile.street}, ${profile.number}`,
      Address: `${profile.complement ? `${profile.complement}, ` : ""}${profile.bairro}`,
      City: `${profile.city}, ${profile.state} - ${profile.cep}`,

      // Dados do Pedido
      Items: JSON.stringify(bag), // A lista de itens
      Subtotal: totals.subtotal,
      Delivery: totals.delivery,
      "Operation Fee": totals.operationFee,
      Total: totals.total,
      Status: "Aguardando Pagamento",
    };

    try {
      // Chama a função createOrder (do airtableClient.ts)
      // O resultado é explicitamente tipado para eliminar o 'any'
      const airtableRes: AirtableOrderResponse = (await createOrder(orderFields)) as AirtableOrderResponse;

      const recordId = airtableRes.records?.[0]?.id;
      const pixData = airtableRes.records?.[0]?.fields?.["Pix Code"]; 

      if (recordId && pixData) {
        setOrderId(recordId);
        setPixCode(generatePix(pixData));
        clearBag(); // Limpa a sacola após gerar o pedido
        setBag([]); 
        setOkMsg("Pedido criado com sucesso! Use o PIX para pagar.");
      } else {
        throw new Error("Resposta do Airtable inválida ou código PIX ausente.");
      }
    } catch (e) {
      console.error("Erro no checkout:", e);
      setErr("Erro ao finalizar o pedido. Tente novamente.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  const copyPix = async () => {
    if (!pixCode) return;
    try {
      await navigator.clipboard.writeText(pixCode);
      alert("Código PIX copiado com sucesso!");
    } catch {
      alert("Não foi possível copiar. Selecione e copie manualmente.");
    }
  };


  // =====================================================
  // RENDERIZAÇÃO
  // =====================================================

  if (loading) {
    return (
      <main className="min-h-screen p-5 pt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Sua Sacola
        </h1>
        <div className="mt-8 flex justify-center items-center h-[50vh]">
          <Loader2 className="animate-spin h-8 w-8 text-black" />
        </div>
      </main>
    );
  }

  // Se não tem usuário e não tem PIX (ainda não logou), pede login
  if (!user && !orderId) {
    return (
      <main className="min-h-screen p-5 pt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Sua Sacola
        </h1>
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-600">
            Faça login para ver e finalizar sua sacola.
          </p>
          <Link
            href="/auth?next=/bag"
            className="mt-6 inline-block rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99]"
          >
            Entrar ou Cadastrar
          </Link>
        </div>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 pb-20">
      <div className="pt-8 px-5">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Sua Sacola
        </h1>
      </div>

      {/* Conteúdo Principal */}
      <div className="max-w-xl mx-auto px-5 mt-6">
        {bag.length === 0 && !orderId ? (
          <div className="text-center py-12">
            <Trash2 className="h-10 w-10 text-neutral-300 mx-auto" />
            <p className="mt-4 text-sm text-gray-600">
              Sua sacola está vazia.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              Começar a comprar
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Lista de Itens */}
            <div className="space-y-4">
              {bag.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 p-3 bg-white border rounded-xl"
                >
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                    {item.photo_url ? (
                      <img
                        src={item.photo_url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid place-items-center h-full text-neutral-400 text-xs">
                        No Image
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col justify-between flex-1 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.store_name} • Tam: {item.size}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-bold text-black">
                        {formatBRL(item.price * item.qty)}
                      </span>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdateQty(item.id, Math.max(1, item.qty - 1))}
                          disabled={item.qty <= 1}
                          className="p-1 border rounded-full disabled:opacity-50"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="text-sm font-semibold w-5 text-center">{item.qty}</span>
                        <button
                          onClick={() => handleUpdateQty(item.id, item.qty + 1)}
                          className="p-1 border rounded-full"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="self-start p-1 text-red-500 hover:text-red-700 transition"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>

            {/* Resumo do Pedido e Checkout */}
            {!orderId && (
              <>
                <div className="space-y-1 pt-4 border-t">
                  <div className="flex justify-between text-sm">
                    <p className="text-gray-600">Subtotal</p>
                    <p className="font-medium">{formatBRL(totals.subtotal)}</p>
                  </div>
                  <div className="flex justify-between text-sm">
                    <p className="text-gray-600">Frete por Loja ({totals.storeCount})</p>
                    <p className="font-medium">{formatBRL(totals.delivery)}</p>
                  </div>
                  <div className="flex justify-between text-sm">
                    <p className="text-gray-600">Taxa de Operação</p>
                    <p className="font-medium">{formatBRL(totals.operationFee)}</p>
                  </div>
                </div>

                <div className="flex justify-between pt-3 border-t">
                  <p className="text-lg font-bold">Total</p>
                  <p className="text-lg font-bold">{formatBRL(totals.total)}</p>
                </div>

                {/* Aviso de Endereço */}
                {!isReadyToCheckout && (
                  <div className="rounded-xl bg-yellow-50 p-3 text-sm text-yellow-800 border border-yellow-200">
                    <p className="font-semibold">Endereço Incompleto</p>
                    <p className="mt-1 text-xs">
                      Por favor, complete seu endereço e WhatsApp no{" "}
                      <Link href="/profile" className="font-medium underline">
                        seu perfil
                      </Link>{" "}
                      para continuar o checkout.
                    </p>
                  </div>
                )}

                {/* Botão de Checkout */}
                <button
                  onClick={handleCheckout}
                  disabled={!isReadyToCheckout || isCheckingOut || bag.length === 0}
                  className={`w-full h-12 rounded-xl text-white text-base font-semibold transition active:scale-[0.99] disabled:opacity-60 ${
                    isReadyToCheckout && bag.length > 0 ? "bg-black" : "bg-gray-400"
                  }`}
                >
                  {isCheckingOut ? (
                    <Loader2 className="animate-spin h-5 w-5 mx-auto" />
                  ) : (
                    "Pagar com PIX"
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {/* Confirmação de PIX */}
        {orderId && (
          <div className="mt-8 p-5 bg-white border rounded-xl shadow-sm">
            <h2 className="text-xl font-bold text-green-600">
              Pedido #{orderId.slice(-6).toUpperCase()} Criado!
            </h2>
            <p className="text-xs text-gray-700 mb-4">
              Use o código abaixo para pagar.
            </p>

            {pixCode ? (
              <>
                <div className="flex justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                      pixCode
                    )}`}
                    alt="QR Code PIX"
                    className="rounded-lg border shadow-lg"
                  />
                </div>
                <div className="mt-4">
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
        )}
      </div>

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
          <p className="mt-1 text-sm text-neutral-600">Loading...</p>
        </main>
      }
    >
      <BagInner />
    </Suspense>
  );
}
