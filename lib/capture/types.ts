// Resultado de interpretar uma fala ou a foto de um cupom: campos para preencher o formulário de lançamento.
// Campo que não está claro vem null: o sistema nunca inventa valor.
export type Capture = {
  type: "expense" | "income" | null;
  amount_cents: number | null;
  description: string | null;
  date: string | null; // AAAA-MM-DD
  installments: number | null;
  payment_method_id: string | null;
  entity_id: string | null;
  confidence: number; // 0 a 1
};

export type CaptureRefs = {
  methods: { id: string; name: string }[];
  entities: { id: string; name: string }[];
  today: string;
};

export const EMPTY_CAPTURE: Capture = {
  type: null, amount_cents: null, description: null, date: null, installments: null, payment_method_id: null, entity_id: null, confidence: 0,
};
