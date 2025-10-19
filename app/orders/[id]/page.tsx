"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image"; // CORREÇÃO: Importar Image para otimização
import { useParams } from "next/navigation";

type AirtableRecord = {
  id: string;
  // CORREÇÃO: Linha 9 - Usar 'unknown' no lugar de 'any'
  fields: Record<string, unknown>; 
  createdTime?: string;
};

type RouteParams = { id: string };

export default function OrderDetailPage() {
  const { id } = useParams<RouteParams>();
  const recordId =
    typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

  const [order, setOrder] = useState<AirtableRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const apiKey =
    process.env.NEXT_PUBLIC_AIRTABLE_API_KEY ||
    process.env.NEXT_PUBLIC_AIRTABLE_TOKEN ||
    "";
  const baseId =
    process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID ||
    process.env.AIRTABLE_BASE_ID ||
    "";
  const tableName =
    process.env.NEXT_PUBLIC_AIRTABLE_TABLE_NAME ||
    process.env.AIRTABLE_TABLE_NAME ||
    "Orders";

  async function fetchOrder() {
    try {
      if (!apiKey || !baseId || !tableName) {
        throw new Error("Variáveis do Airtable ausentes. Verifique .env.local");
      }
      if (!recordId) throw new Error("ID do pedido inválido.");

      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
        tableName
      )}/${recordId}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Airtable ${res.status}: ${text}`);
      }

      const data = (await res.json()) as AirtableRecord;
      setOrder(data);
    } catch (e: unknown) {
      setErr((e instanceof Error ? e.message : undefined) ?? "Erro ao carregar pedido.");
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }

  // Reload quando o ID muda e no intervalo
  useEffect(() => {
    fetchOrder();
    const interval = setInterval(() => {
      setReloading(true);
      fetchOrder();
    }, 15000); // Recarrega a cada 15s

    return () => clearInterval(interval);
  }, [recordId, apiKey, baseId, tableName]);

  if (loading) {
    return <main className="min-h-screen bg-white" />;
  }
  if (err) {
    return (
      <main className="min-h-screen bg-white max-w-md mx-auto p-5 pt-10">
        <p className="text-sm text-red-600">{err}</p>
        <Link href="/orders" className="mt-4 text-sm text-black underline">
          Voltar para Pedidos
        </Link>
      </main>
    );
  }
  if (!order) {
    return (
      <main className="min-h-screen bg-white max-w-md mx-auto p-5 pt-10">
        <p className="text-sm text-gray-600">Pedido não encontrado.</p>
        <Link href="/orders" className="mt-4 text-sm text-black underline">
          Voltar para Pedidos
        </Link>
      </main>
    );
  }

  const { fields } = order;
  const status = (fields.Status as string | undefined) ?? "novo";
  const total = (fields.Total as number | undefined) ?? 0;
  const notes = (fields.Notes as string | undefined) ?? "";
  const createdAt = order.createdTime;

  // Extrair itens (fallback)
  function getItems() {
    const jsonItems = (fields.Items || fields.items || fields.products) as string | unknown[] | null | undefined;
    if (typeof jsonItems === "string") {
      try {
        const parsed = JSON.parse(jsonItems) as { name: string; qty: number; photo_url?: string; }[];
        return parsed.map((item) => ({
          name: item.name,
          qty: item.qty,
          photo_url: item.photo_url,
        }));
      } catch {
        return [];
      }
    }
    if (Array.isArray(jsonItems)) {
        // Tentativa de inferir a estrutura de um array simples de objetos (sem tipagem Airtable)
        return jsonItems.map((item: unknown) => ({
            name: (item as { name: string })?.name || "Item",
            qty: (item as { qty: number })?.qty || 1,
            photo_url: (item as { photo_url: string })?.photo_url,
        }));
    }
    return [];
  }
  const items = getItems();

  const isPixPending = status.toLowerCase() === "novo"; // PIX é gerado apenas no status "novo"
  const pixCode = (fields.pix_code as string | undefined) ?? "";

  function formatBRL(v?: number) {
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
    } catch {
      return `R$ ${(v ?? 0).toFixed(2)}`;
    }
  }

  return (
    <main className="bg-white text-black max-w-md mx-auto min-h-screen p-5">
      <div className="pt-6 flex items-center justify-between">
        <h1 className="text-[28px] leading-7 font-bold tracking-tight">
          Pedido {recordId.slice(0, 8)}
        </h1>
        <Link
          href="/orders"
          className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm hover:bg-gray-50"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            stroke="currentColor"
            fill="none"
          >
            <path
              d="M15 18l-6-6 6-6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Voltar
        </Link>
      </div>

      <div className="mt-4 flex flex-col gap-1 text-sm">
        <p>
          Status: <span className="font-semibold capitalize">{status}</span>
          {reloading && (
            <span className="text-xs text-gray-500 ml-2">(checking…)</span>
          )}
        </p>
        <p>
          Total: <span className="font-semibold">{formatBRL(total)}</span>
        </p>
        {createdAt && (
          <p>
            Criado em:{" "}
            <span className="font-semibold">
              {new Date(createdAt).toLocaleDateString("pt-BR", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </p>
        )}
      </div>

      {notes && (
        <div className="mt-4 p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-sm">
          <p className="font-medium mb-1">Observações do Pedido:</p>
          <p className="text-gray-600 whitespace-pre-wrap">{notes}</p>
        </div>
      )}

      {/* Itens do Pedido */}
      <h2 className="text-xl font-bold mt-6 mb-3">Itens</h2>
      <div className="space-y-4">
        {items.map((item, index) => {
          const thumb = item.photo_url || "";
          const qty = item.qty || 1;

          return (
            <div key={index} className="flex gap-4 p-3 rounded-xl border">
              <div className="relative h-20 w-20 rounded-lg overflow-hidden bg-neutral-100 shrink-0">
                {thumb ? (
                  <Image // CORREÇÃO: Linha 199 - Uso de <Image />
                    src={thumb}
                    alt={item.name || "Produto"}
                    fill
                    sizes="80px"
                    className="object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">
                    📦
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Qty: {qty}
                </p>
                {item.store_name && (
                  <p className="text-xs text-gray-500 mt-1">
                    Loja: {item.store_name}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* PIX Payment Info */}
      {isPixPending && pixCode && (
        <div className="mt-8 p-5 rounded-xl bg-yellow-50 border border-yellow-200">
          <h2 className="text-xl font-bold text-yellow-800 mb-4">
            Aguardando pagamento PIX
          </h2>
          <p className="text-xs text-gray-700 mb-3">
            Use o QR abaixo ou copie o código para pagar.
          </p>
          <div className="flex justify-center">
            <div className="relative h-[220px] w-[220px]"> {/* CORREÇÃO: Adicionar div para Image */}
              <Image
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  pixCode
                )}`}
                alt="QR Code PIX"
                width={220}
                height={220}
                className="rounded-lg"
              />
            </div>
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
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(pixCode);
                  alert("Código PIX copiado!");
                } catch {
                  alert(
                    "Não foi possível copiar. Selecione e copie manualmente."
                  );
                }
              }}
              className="mt-2 rounded-lg bg-black text-white px-3 py-2 text-sm font-semibold"
            >
              Copiar código
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
