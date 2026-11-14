Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




Caixa Aventure — Especificação do sistema
de DRE e BPO financeiro
  ​Nov 10, 2026      ·   ​@AVENTURE COMUNICAÇÃO




1. Visão e objetivos
O sistema substitui a planilha de contas por um caixa único da família e da Aventure, que
separa sozinho o que é da empresa e o que é de cada pessoa. Ele é lançado pelo celular em
segundos e analisado no computador como DRE e fluxo de caixa.

O problema de hoje. As contas são unificadas: cartões de quatro titulares pagam
assinaturas da empresa, gastos da casa e gastos pessoais misturados. Por isso ninguém
sabe ao certo se a Aventure dá lucro, quanto cada pessoa gasta nem onde dá para
economizar.

O que o sistema precisa entregar:

       Lançamento de uma entrada ou saída pelo celular em menos de 10 segundos, com a IA
       sugerindo entidade e categoria.
       O DRE mensal real da Aventure (ME, Simples Nacional), independente do cartão onde
       o gasto caiu.
       Uma visão por pessoa (Ventura, Amanda, Alexandre, Toinha) e por casa.
       Um fluxo de caixa projetado de 3 a 6 meses, com parcelas, fixas e recebimentos já
       previstos.
       Um analista financeiro com IA que aponta vazamentos, gastos supérfluos e metas de
       economia.
       A importação da planilha atual, com perguntas apenas sobre o que a IA não conseguir
       classificar.

Fases:


  Fase         Para quem                                            Entrega principal

  MVP          Uso interno (Ventura e                               Lançamento rápido, cartões e parcelas,
               Amanda)                                              importação da planilha, painel do mês e fluxo

  V2           Uso interno                                          Voz e foto, DRE completo, analista com IA,
                                                                    conferência de fatura, integração com o Asaas

  V3           Clientes da Aventure (BPO)                           Várias empresas, papel de analista BPO, planos e
                                                                    cobrança, Open Finance




                                                                                                                    Page 1 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




Regra de ouro: usar internamente por 60 dias antes de abrir a V3. O produto só vale para
cliente quando o hábito de lançar funcionar para vocês.

Nome provisório: Caixa Aventure (decisão em aberto na seção 10).


2. Conceitos centrais
Todo lançamento carrega quatro etiquetas independentes. O meio de pagamento nunca
define de quem é o gasto: uma assinatura do ChatGPT no cartão da Toinha continua sendo
da Aventure.


  Etiqueta              Pergunta                                    Valores

  Entidade              Quem arca com o gasto (ou recebe            Aventure (PJ) · Ventura (PF) · Amanda
                        a entrada)?                                 (PF) · Alexandre (PF) · Toinha (PF) · Casa
                                                                    (compartilhado)

  Pessoa                Quem fez o gasto?                           Ventura · Amanda · Alexandre · Toinha

  Meio                  Por onde o dinheiro saiu?                   Cartões, conta Asaas PJ, contas PF, Pix,
                                                                    dinheiro

  Categoria             O que é?                                    Plano de categorias da seção 5; cada
                                                                    categoria aponta para uma linha do DRE


Competência x caixa. Cada lançamento guarda duas datas. A data de competência (dia
da compra ou do serviço) alimenta o DRE. A data de caixa (vencimento da fatura ou dia do
Pix) alimenta o fluxo de caixa. Uma compra no cartão feita em 14/11 entra no DRE de
novembro e no caixa de dezembro.

Parcelas. Uma compra parcelada é um grupo: o sistema gera uma linha por parcela, cada
uma com a fatura em que cai, calculada pelo dia de fechamento do cartão. Compras no dia
do fechamento ou depois caem na fatura seguinte.

Recorrências. Assinaturas e contas fixas são regras (valor, dia, início, fim opcional). Um
job mensal gera os lançamentos previstos do mês. Pagar ou receber muda o status de
previsto para realizado e guarda o valor real.

Retiradas e reembolsos. Quando dinheiro da Aventure paga um gasto de pessoa física, o
sistema não lança despesa da empresa: registra uma retirada do sócio. Quando uma
pessoa paga um gasto da Aventure com cartão pessoal, registra um reembolso devido da
empresa para a pessoa. Assim o DRE mostra o lucro real, e uma linha separada mostra
quanto os sócios estão tirando.




                                                                                                         Page 2 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




Transferências. Dinheiro movido entre contas próprias (Asaas para Nubank, pagamento
de fatura) não é receita nem despesa. A fatura do cartão, por exemplo, é só a liquidação
das compras que já foram lançadas uma a uma.


3. Usuários, pessoas e meios de pagamento
Só Ventura e Amanda acessam o sistema. Alexandre e Toinha existem como pessoas e
entidades, porque gastam por conta própria, mas não fazem login: os gastos deles são
lançados por Ventura ou Amanda.

Usuários (login):


  Usuário            Papel                                                      Pode

  Ventura            Dono                                                       Tudo, incluindo configurações,
                                                                                integrações e exclusões

  Amanda             Dona (responsável pelo contas a pagar                      Tudo, incluindo configurações,
                     e a receber)                                               integrações e exclusões


O modelo já prevê os papéis owner , editor , viewer e bpo_analyst para a V3.

Meios de pagamento (cadastrados em Configurações, com dia de fechamento e
vencimento editáveis):


  Meio                             Titular                   Fecha         Vence           Observação

  Cartão Itaú                      a confirmar               13            20              Cartão principal; maior
                                                                                           volume de compras e
                                                                                           assinaturas

  Nubank                           Amanda                    8             15              Limite R$ 300
  Amanda

  Cartão R$ 300                    a confirmar               18            25              Banco a confirmar
  (vence 25)                                                 (estimado)

  Nubank Ventura                   Ventura                   10            18              Concentra parte das
                                                             (estimado)                    ferramentas da Aventure

  Cartão                           Alexandre                 29            6
  Alexandre                                                  (estimado)

  Cartão Toinha                    Toinha                    a confirmar   a
                                                                           confirmar




                                                                                                                     Page 3 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




  Meio                             Titular                   Fecha         Vence       Observação

  Cartão Asaas PJ                  Aventure                  a confirmar   a           Novo; destino das
                                                                           confirmar   assinaturas da empresa

  Conta Asaas PJ                   Aventure                  —             —           Recebe dos clientes;
                                                                                       integração por API (V2)

  Contas PF                        Ventura,                  —             —           Bancos a cadastrar
                                   Amanda


Migração para o cartão PJ. O sistema ganha uma tela de "gastos da Aventure fora do PJ":
lista o que é da empresa mas cai em cartão pessoal, com o total mensal. É a lista de
trabalho para migrar as assinaturas para o cartão Asaas, e o número deve cair mês a mês.


4. Telas
O celular é para lançar e conferir; o computador é para analisar. As duas versões são o
mesmo app (PWA responsivo), com navegação diferente: barra inferior no celular, menu
lateral no desktop.


Celular
   1. Início: saldo do mês (receber − pagar), contas que vencem em 7 dias, fatura atual de
       cada cartão e o botão "+" fixo.
   2. Lançamento rápido (o principal): abre direto no teclado numérico. Valor → descrição
       → meio → parcelas. Vêm preenchidos o último meio usado, a data de hoje, "à vista" e a
       pessoa logada. A IA sugere entidade e categoria como chips: [Aventure]
       [Ferramentas] [Itaú] [1x]. Um toque salva; tocar num chip troca o valor. Alterna entre
       Saída, Entrada e Transferência.
   3. Lançar por voz: um botão de microfone; "gastei 45 no Cometa no Itaú" vira o mesmo
       formulário já preenchido, só para confirmar.
   4. Foto do cupom ou print: a câmera ou a galeria; o Claude lê valor, data e
       estabelecimento e abre o formulário preenchido. A imagem fica anexada ao
       lançamento.
   5. Fila de revisão: um cartão por item que a IA classificou com baixa confiança
       (importação, fatura, foto). Botões grandes: Aventure / Ventura / Amanda / Alexandre /
       Toinha / Casa. Cada resposta pode virar regra ("sempre que aparecer Guará, é Casa").
   6. Contas do mês: lista por vencimento com status (a pagar, vence em breve, vencida,
       paga). Deslizar marca como pago e pede o valor real se for diferente do previsto.




                                                                                                             Page 4 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




Requisitos do lançamento: menos de 10 segundos do toque no "+" ao salvar, e
funcionamento sem internet (fila local que sincroniza quando a conexão volta).


Desktop
   1. Painel: seletor de mês; cards de receita, despesa, resultado, retiradas e saldo
       projetado; gráfico de 12 meses; alertas.
   2. DRE: mês a mês da Aventure (seção 5), com comparação com o mês anterior e com a
       média de 3 meses. Clicar numa linha abre os lançamentos dela.
   3. Fluxo de caixa: projeção de 6 meses, dia a dia ou semana a semana, com o saldo
      previsto e os meses negativos em destaque.
   4. Cartões: fatura de cada cartão por mês, compras parceladas com "3/8, faltam 5",
       assinaturas ativas e a divisão PJ/PF de cada fatura.
   5. Pessoas e casa: quanto cada pessoa gastou, por categoria, com tendência.
   6. Clientes: receita por cliente, quem paga em dia e quem atrasa, concentração (quanto
      o maior cliente representa) e contratos que vencem.
   7. Lançamentos: tabela completa com filtros, edição em lote e exportação CSV.
   8. Importações: subir planilha, fatura (PDF/CSV) ou extrato (OFX); ver o que entrou, o
       que foi para a fila e o que é duplicado.
   9. Analista IA: relatório mensal e chat com perguntas sobre os dados ("quanto gastamos
       com delivery em outubro?").
 10. Configurações: entidades, pessoas, meios (fechamento e vencimento), categorias,
       regras de classificação, recorrências, integração com o Asaas.


5. DRE e plano de categorias
O DRE da Aventure usa apenas lançamentos da entidade Aventure, por competência. O
imposto é calculado pela alíquota efetiva do Simples Nacional, configurável, e conferido
com o DAS pago. Gastos de pessoas físicas nunca entram no DRE: viram orçamento
doméstico, ou retirada quando pagos pela empresa.


Estrutura do DRE (ME, Simples Nacional)

  Linha                                         O que entra                Exemplos de hoje

  (+) Receita bruta de                          Mensalidades, projetos e   SR Tecnologia, Siqueira
  serviços                                      parcelas, por cliente      Nocrato, Tangram, Plasfran,
                                                                           Madeserpa, Fino Mobiliário,
                                                                           José Luiz




                                                                                                    Page 5 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




  Linha                                         O que entra                      Exemplos de hoje

  (−) Simples Nacional                          Alíquota efetiva × receita       Previsto pela alíquota;
  (DAS)                                         bruta do mês                     realizado pelo DAS pago

  (−) Cancelamentos e                           Descontos concedidos,
  descontos                                     estornos

  = Receita líquida

  (−) Custo dos serviços                        Equipe e freelancers de          ChatGPT, CapCut, Canva,
  prestados                                     entrega, ferramentas de          Google Workspace da
                                                produção, terceiros              Aventure, edição terceirizada

  = Margem de
  contribuição (R$ e %)

  (−) Despesas                                  Contabilidade, endereço          Contador Clara, endereço
  administrativas                               fiscal, sistemas, tarifas do     fiscal, Raytech
                                                Asaas

  (−) Despesas comerciais                       Tráfego próprio, eventos,
                                                brindes, deslocamento
                                                comercial

  (−) Despesas de                               Parte da casa usada pela         Internet, energia,
  estrutura                                     empresa (rateio opcional)        equipamentos

  (−) Pró-labore                                Retirada formal mensal, se
                                                houver

  = Resultado operacional

  (±) Resultado financeiro                      Juros, anuidade do cartão PJ,
                                                tarifas bancárias, rendimentos

  = Lucro líquido (R$ e %)

  (−) Distribuição e                            Gastos PF pagos pela
  retiradas                                     Aventure e transferências aos
                                                sócios

  = Caixa retido na                             O que sobrou de fato
  empresa


O enquadramento no Anexo III ou V do Simples depende do CNAE e do Fator R. A alíquota
efetiva deve ser confirmada com a contadora e cadastrada em Configurações.




                                                                                                           Page 6 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




Rateio da casa. Uma categoria compartilhada (internet, energia) pode ter um percentual
de rateio para a Aventure, por exemplo 30%. O sistema divide o lançamento: 30% vai para
Despesas de estrutura e 70% para Casa.


Plano de categorias
Cada categoria tem um tipo de entidade (PJ, PF ou ambas), uma linha do DRE (só PJ) e
uma natureza para o analista: essencial, importante ou supérfluo.


  Categoria                                                         Entidade   Linha do DRE           Natureza

  Mensalidade de cliente                                            PJ         Receita bruta          —

  Projeto / parcela de projeto                                      PJ         Receita bruta          —

  Equipe e freelancers                                              PJ         Custo dos serviços     essencial

  Ferramentas de produção                                           PJ         Custo dos serviços     importante

  Contabilidade e fiscal                                            PJ         Despesas               essencial
                                                                               administrativas

  Sistemas e fornecedores                                           PJ         Despesas               importante
                                                                               administrativas

  Marketing próprio                                                 PJ         Despesas comerciais    importante

  Impostos (DAS)                                                    PJ         Simples Nacional       essencial

  Tarifas e juros                                                   PJ e PF    Resultado financeiro   importante
                                                                               (PJ)

  Moradia (condomínio, financiamento,                               PF         —                      essencial
  construtora)

  Contas da casa (energia, internet,                                PF         Estrutura (se houver   essencial
  telefone)                                                                    rateio)

  Educação                                                          PF         —                      essencial

  Mercado                                                           PF         —                      essencial

  Delivery e restaurantes                                           PF         —                      supérfluo

  Transporte e carro                                                PF         —                      importante

  Saúde e farmácia                                                  PF         —                      essencial

  Compras pessoais (roupas, beleza,                                 PF         —                      supérfluo
  lojas)




                                                                                                           Page 7 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




  Categoria                                                         Entidade   Linha do DRE           Natureza

  Eletrônicos                                                       PF         —                      importante

  Assinaturas pessoais                                              PF         —                      supérfluo

  Pets                                                              PF         —                      importante

  Lazer e presentes                                                 PF         —                      supérfluo

  Empréstimos e financiamentos                                      PF         —                      essencial

  Serviços domésticos                                               PF         —                      importante

  Outros                                                            PJ e PF    Despesas               —
                                                                               administrativas (PJ)


As categorias são editáveis. A natureza é só uma sugestão inicial para o analista: vocês
ajustam o que consideram supérfluo.


6. Stack e arquitetura
Três projetos novos: um repositório no GitHub, um projeto na Vercel ligado a ele e um
projeto no Supabase. Toda chamada à IA e ao Asaas passa pelo servidor, e nenhuma chave
fica no navegador.




arquitetura · 2 telas, 1 app, 3 serviços

O celular e o computador só falam com o app. O Asaas avisa o app por webhook quando
um cliente paga, e o cron chama o app para gerar as contas do mês.




                                                                                                           Page 8 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




  Camada                       Escolha                              Por quê

  App                          Next.js (App Router) + TypeScript    Um código para celular e desktop;
                                                                    rotas de servidor para IA e
                                                                    webhooks

  Interface                    Tailwind + shadcn/ui + Recharts      Componentes prontos e gráficos
                                                                    simples

  PWA                          Serwist (service worker) +           Instala na tela do celular e guarda
                               IndexedDB (Dexie)                    lançamentos sem internet

  Hospedagem                   Vercel                               Deploy a cada push, variáveis de
                                                                    ambiente, cron jobs

  Banco e login                Supabase (Postgres, Auth, Storage,   Login por e-mail, fotos de cupom em
                               RLS)                                 bucket privado, isolamento por
                                                                    organização

  Jobs                         Vercel Cron chamando rotas           Gerar recorrências do mês, alertas
                               protegidas                           diários, relatório mensal

  IA                           Claude API (SDK @anthropic-          Classificação, leitura de foto e de
                               ai/sdk )                             texto falado, analista mensal

  Voz                          Web Speech API do navegador (ou      Transforma a fala em texto sem
                               o ditado do teclado)                 custo; o Claude interpreta o texto

  Recebimentos                 API e webhooks do Asaas              Marca a mensalidade como
                                                                    recebida quando o cliente paga

  Validação                    Zod em toda entrada de API           Dados de IA e de webhook nunca
                                                                    entram no banco sem validação


Modelos de IA por tarefa: Claude Haiku 5.5 para classificar lançamentos (rápido e barato),
Claude Sonnet 5.5 para ler fotos, PDFs de fatura e texto falado, e Claude Opus 5.5 para o
relatório mensal do analista. Os nomes dos modelos ficam em variáveis de ambiente, para
trocar sem mexer no código.

Regras técnicas:

       Dinheiro em centavos ( bigint ), nunca em float .
       Datas em date , com fuso America/Fortaleza para "hoje" e para o mês corrente.
       Toda tabela de dados tem org_id e política de RLS desde o primeiro dia.
       Chaves ( ANTHROPIC_API_KEY , ASAAS_API_KEY , SUPABASE_SERVICE_ROLE_KEY ) só no
       servidor.




                                                                                                    Page 9 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




       O webhook do Asaas confere o token de autenticação e é idempotente (o mesmo
       evento duas vezes não duplica nada).
       Antes de depender do Asaas para o cartão PJ, verificar se a API expõe as transações
       do cartão. Se não expuser, a fatura entra por importação de CSV/PDF.


7. Modelo de dados
O centro do modelo é uma única tabela transactions , com uma linha por movimento
(uma parcela, uma ocorrência de assinatura, um recebimento). DRE, fluxo de caixa, faturas
e visão por pessoa são views sobre ela. Este SQL é o ponto de partida da primeira
migration do Supabase.

  -- ===== Organização e acesso =====
  create table organizations (
    id uuid primary key default gen_random_uuid(),
       name text not null,
       created_at timestamptz not null default now()
  );


  create type member_role as enum ('owner','editor','viewer','bpo_analyst');
  create table memberships (
    org_id uuid not null references organizations(id) on delete cascade,
       user_id uuid not null references auth.users(id) on delete cascade,
       role member_role not null default 'owner',
       primary key (org_id, user_id)
  );


  create function is_member(o uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from memberships m where m.org_id = o and m.user_id
  = auth.uid());
  $$;


  -- ===== Cadastros =====
  create type entity_kind as enum ('pj','pf','shared');
  create table entities (
       id uuid primary key default gen_random_uuid(),
       org_id uuid not null references organizations(id) on delete cascade,
    name text not null,                                             -- Aventure, Ventura, Amanda,
  Alexandre, Toinha, Casa
       kind entity_kind not null,
       document text                                                -- CNPJ/CPF opcional
  );




                                                                                                    Page 10 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




  create table people (
    id uuid primary key default gen_random_uuid(),
       org_id uuid not null references organizations(id) on delete cascade,
       name text not null,
       user_id uuid references auth.users(id),   -- null para Alexandre e Toinha
       default_entity_id uuid references entities(id)
  );


  create type pm_kind as enum ('credit_card','bank_account','pix','cash');
  create table payment_methods (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references organizations(id) on delete cascade,
       name text not null,
       kind pm_kind not null,
    holder_person_id uuid references people(id),
    owner_entity_id uuid not null references entities(id),                  -- de quem é o
  dinheiro que paga este meio
       closing_day smallint check (closing_day between 1 and 31),
       due_day smallint check (due_day between 1 and 31),
       credit_limit_cents bigint,
       active boolean not null default true
  );

  create type dre_line as enum
  ('gross_revenue','tax','deductions','cost_of_services',


  'admin_expenses','sales_expenses','structure_expenses','pro_labore','financia
  l','distribution','none');
  create type category_nature as enum ('essential','important','superfluous');
  create table categories (
    id uuid primary key default gen_random_uuid(),
       org_id uuid not null references organizations(id) on delete cascade,
       name text not null,
       applies_to entity_kind,             -- null = ambas
       direction text not null check (direction in ('in','out')),
       dre_line dre_line not null default 'none',
       nature category_nature,
       pj_share_pct numeric(5,2) not null default 0                 -- rateio da casa para a
  Aventure
  );


  create table clients (
       id uuid primary key default gen_random_uuid(),
       org_id uuid not null references organizations(id) on delete cascade,
       name text not null,
       document text,




                                                                                             Page 11 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




       asaas_customer_id text,
       active boolean not null default true
  );


  -- ===== Regras que geram lançamentos =====
  create table recurring_rules (
       id uuid primary key default gen_random_uuid(),
       org_id uuid not null references organizations(id) on delete cascade,
       direction text not null check (direction in ('in','out')),
       description text not null,
       amount_cents bigint not null,
       day_of_month smallint not null,
       start_month date not null,                                   -- sempre dia 1
       end_month date,                                              -- null = sem fim
       entity_id uuid not null references entities(id),
       category_id uuid references categories(id),
       payment_method_id uuid references payment_methods(id),
       client_id uuid references clients(id),
       active boolean not null default true
  );


  create table installment_groups (
    id uuid primary key default gen_random_uuid(),
       org_id uuid not null references organizations(id) on delete cascade,
       description text not null,
       installment_cents bigint not null,
       installments smallint not null,
       purchase_date date,
       first_invoice_month date not null,
       payment_method_id uuid not null references payment_methods(id)
  );

  -- ===== Movimentos =====
  create type tx_type as enum ('expense','income','transfer');
  create type tx_status as enum ('forecast','pending','paid');
  create type tx_source as enum
  ('manual','voice','photo','import_sheet','import_invoice','asaas','recurring'
  );
  create table transactions (
    id uuid primary key default gen_random_uuid(),
       org_id uuid not null references organizations(id) on delete cascade,
       type tx_type not null,
       status tx_status not null default 'pending',
       description text not null,
       amount_cents bigint not null check (amount_cents >= 0),
       paid_amount_cents bigint,




                                                                                        Page 12 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




      competence_date date not null,                                -- DRE
      cash_date date not null,                                      -- fluxo de caixa (vencimento da
  fatura, dia do Pix)
    invoice_month date,                                             -- fatura do cartão (dia 1 do mês de
  vencimento)
      entity_id uuid not null references entities(id),
      person_id uuid references people(id),
      payment_method_id uuid references payment_methods(id),
      category_id uuid references categories(id),
      client_id uuid references clients(id),
      installment_group_id uuid references installment_groups(id) on delete
  cascade,
      installment_number smallint,
      recurring_rule_id uuid references recurring_rules(id),
      transfer_pair_id uuid,              -- liga as duas pernas de uma
  transferência
      source tx_source not null default 'manual',
      external_id text,                   -- id do Asaas, linha da fatura, linha
  da planilha
      ai_confidence numeric(3,2),
      needs_review boolean not null default false,
      receipt_path text,                  -- Storage: receipts/{org_id}/{id}.jpg
      notes text,
      created_by uuid references auth.users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (org_id, source, external_id)
  );
  create index on transactions (org_id, competence_date);
  create index on transactions (org_id, cash_date);
  create index on transactions (org_id, needs_review) where needs_review;

  -- ===== Aprendizado e importação =====
  create table classification_rules (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null references organizations(id) on delete cascade,
      match_text text not null,                                     -- normalizado: minúsculo, sem acento
    match_kind text not null default 'contains' check (match_kind in
  ('contains','equals')),
      payment_method_id uuid references payment_methods(id),                           -- regra só para um
  meio, opcional
      entity_id uuid references entities(id),
      category_id uuid references categories(id),
      person_id uuid references people(id),
      hits int not null default 0,
      created_at timestamptz not null default now()




                                                                                                       Page 13 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




  );


  create table imports (
    id uuid primary key default gen_random_uuid(),
       org_id uuid not null references organizations(id) on delete cascade,
    kind text not null check (kind in
  ('sheet','invoice_pdf','invoice_csv','ofx')),
       file_path text not null,
       status text not null default 'processing',
       stats jsonb,                         -- {total, ok, review, duplicate}
       created_by uuid references auth.users(id),
       created_at timestamptz not null default now()
  );

  create table org_settings (
       org_id uuid primary key references organizations(id) on delete cascade,
       tax_regime text not null default 'simples_nacional',
       simples_effective_rate numeric(5,4), -- ex.: 0.0600
       timezone text not null default 'America/Fortaleza'
  );

  create table ai_insights (
       id uuid primary key default gen_random_uuid(),
       org_id uuid not null references organizations(id) on delete cascade,
       period_month date not null,
       kind text not null check (kind in ('monthly_report','alert')),
       content jsonb not null,
       created_at timestamptz not null default now()
  );


  -- ===== RLS (repetir para cada tabela com org_id) =====
  alter table transactions enable row level security;
  create policy tx_rw on transactions for all
       using (is_member(org_id)) with check (is_member(org_id));


Views principais:

        v_dre_monthly : soma por mês de competência e por dre_line , só para a entidade
       PJ, aplicando pj_share_pct nas categorias rateadas.
        v_cash_flow : soma por cash_date de entradas e saídas, com saldo acumulado e
       previsto x realizado.
        v_card_invoices : total por meio de pagamento e invoice_month , com a divisão
       PJ/PF.
        v_settlements : retiradas (gasto PF pago por meio cujo owner_entity_id é a
       Aventure) e reembolsos devidos (gasto PJ pago por meio de pessoa física).



                                                                                     Page 14 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




        v_people_spend : gasto por pessoa e categoria por mês.

Cálculo da fatura (função invoice_month_for(purchase_date, closing_day,
due_day) ): se o dia da compra for maior ou igual ao fechamento, avança um mês; se o
vencimento for menor ou igual ao fechamento (caso do Alexandre: fecha 29, vence 6),
avança mais um. O resultado é o dia 1 do mês de vencimento.



8. Inteligência artificial
A IA entra em quatro pontos, sempre com saída em JSON validada por Zod e sempre como
sugestão que a pessoa confirma. Regras aprendidas vêm antes da IA: o que já tem regra
não gasta chamada.


8.1 Classificação de lançamentos
Ordem de decisão para cada lançamento novo:

   1. Regra exata em classification_rules (texto normalizado, e meio de pagamento se
       a regra tiver): aplica direto, confiança 1.0.
   2. Histórico: o mesmo texto já confirmado 3 vezes com a mesma entidade e categoria
       vira regra automática.
   3. Claude Haiku: recebe a descrição, o valor, o meio, a pessoa e as listas de entidades e
       categorias, e devolve a sugestão com confiança.
   4. Confiança de 0.80 ou mais entra direto; abaixo disso, entra com needs_review =
       true e vai para a fila.

  SISTEMA: Você classifica lançamentos financeiros de uma família que tem uma
  agência de marketing
  (Aventure Comunicação, ME no Simples Nacional, Fortaleza-CE). As contas são
  misturadas: um cartão
  pessoal pode pagar uma ferramenta da empresa. Decida pela natureza do gasto,
  não pelo cartão.
  Entidades: {entities}. Pessoas: {people}. Categorias (nome, entidade,
  direção): {categories}.
  Exemplos confirmados recentes: {examples}.
  Responda só com JSON: {"entity_id", "category_id", "person_id", "confidence"
  (0 a 1),
  "question" (pergunta curta em português se confidence < 0.8, senão null)}.
  USUÁRIO:
  {"description":"CANVA","amount":49.00,"payment_method":"Itaú","person":"Amand
  a"}




                                                                                       Page 15 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




8.2 Voz e foto
Voz: o navegador transforma a fala em texto; o Claude Sonnet converte o texto em
lançamento. "Gastei 45 no Cometa no Itaú em 3 vezes" vira valor 45,00, descrição Cometa,
meio Itaú, 3 parcelas. A classificação da 8.1 roda em seguida.

Foto: a imagem vai para o Storage e, por URL assinada, para o Claude Sonnet, que extrai
estabelecimento, data, valor total e número de parcelas, se houver. Valor ilegível volta
vazio, nunca inventado.

  SISTEMA: Extraia os dados desta compra. Responda só com JSON:
  {"merchant", "date" (AAAA-MM-DD ou null), "total" (número ou null),
  "installments" (número ou 1),
  "payment_hint" (últimos 4 dígitos ou nome do cartão, se aparecer),
  "confidence"}.
  Nunca invente um valor que não esteja legível.



8.3 Importação da planilha atual
A planilha de hoje tem um formato próprio: blocos de mês um embaixo do outro, "GASTOS
MENSAIS" com valor, descrição e vencimento, recebimentos por dia, colunas por mês com
as compras do cartão e um bloco "CARTÃO ALEXANDRE". O importador funciona assim:

   1. Leitura: SheetJS lê o .xlsx (ou a exportação do Google Sheets) no servidor.
   2. Mapa do layout: o Claude Sonnet recebe as células e devolve um mapa: onde está
       cada bloco, a qual mês e cartão ele pertence e qual coluna é valor, descrição e data. A
       pessoa confere o mapa numa tela antes de importar.
   3. Parcelas sem duplicar: "MACBOOK 11/12" em novembro e "MACBOOK 12/12" em
       dezembro são a mesma compra. O importador reconhece o padrão n/N , agrupa por
       descrição e valor e cria um único installment_group , com a primeira fatura calculada
       para trás.
   4. Assinaturas: itens que se repetem com o mesmo valor em 3 ou mais meses (ChatGPT,
       CapCut, Canva) viram recurring_rules .
   5. Fixas: linhas de "GASTOS MENSAIS" que se repetem (condomínio, colégio, energia)
       viram regras recorrentes; a fatura do cartão (linha "ITAU") não é importada como
       despesa, porque as compras já estão detalhadas.
   6. Classificação: cada item passa pela 8.1. Os de baixa confiança vão para a fila, com
       perguntas agrupadas ("Estes 9 itens de mercado são da Casa?").
   7. Relatório: total importado, quantos foram para a fila e quantos foram ignorados como
       duplicados, com a opção de desfazer a importação inteira.




                                                                                        Page 16 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




8.4 Analista financeiro
Todo dia 1, um job gera o relatório do mês anterior com o Claude Opus. Ele recebe só
dados agregados (DRE, gasto por categoria, entidade e pessoa, assinaturas ativas,
variação contra a média de 3 meses), nunca a lista completa de lançamentos.

  SISTEMA: Você é o analista financeiro da Aventure Comunicação e da família
  dos sócios.
  Seja direto e específico, com números. Não faça recomendação de investimento.
  Com os dados agregados abaixo, responda só com JSON:
  {"resumo" (3 frases), "saude_aventure" (margem, lucro, retiradas vs lucro),
  "vazamentos": [{"item", "valor_mensal", "motivo"}],               -- assinaturas
  duplicadas ou sem uso, supérfluos recorrentes
  "economia": [{"acao", "economia_mensal", "economia_3_meses"}],
  "alertas": [{"tipo", "mensagem"}],                                   -- mês negativo
  previsto, cliente atrasando, concentração
  "pergunta_para_voces" (uma pergunta que ajudaria a decidir algo)}
  DADOS: {aggregates_json}


Chat com os dados: o Claude responde perguntas usando ferramentas de leitura pré-
definidas ( gasto_por_categoria , dre_do_mes , fluxo_projetado ,
 lancamentos_filtrados ). Ele nunca escreve SQL livre, e as ferramentas sempre filtram
pela organização do usuário.


9. Roteiro para o Codex
O MVP tem 8 etapas; a V2 tem mais 5. Faça uma etapa por vez, teste no celular e só então
passe para a próxima. Pedir tudo de uma vez faz o Codex gerar muito código difícil de
conferir.


Antes de começar (manual, uma vez)
       Criar o repositório no GitHub (privado), por exemplo caixa-aventure
       Criar o projeto no Supabase (região São Paulo) e anotar URL, anon key e
        service_role key
       Criar o projeto na Vercel ligado ao repositório
       Cadastrar na Vercel: NEXT_PUBLIC_SUPABASE_URL , NEXT_PUBLIC_SUPABASE_ANON_KEY ,
        SUPABASE_SERVICE_ROLE_KEY , ANTHROPIC_API_KEY , CRON_SECRET e, na V2,
        ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN
       Colocar este documento no repositório como docs/ESPECIFICACAO.md e criar o
        AGENTS.md abaixo

 AGENTS.md (o Codex lê este arquivo em toda tarefa):



                                                                                     Page 17 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




  # Caixa Aventure — regras do projeto
  - Especificação completa em docs/ESPECIFICACAO.md. Siga-a; em dúvida,
  pergunte antes de inventar.
  - Stack: Next.js App Router + TypeScript estrito, Tailwind, shadcn/ui,
  Supabase (@supabase/ssr), Zod.
  - Interface em português do Brasil. Moeda R$ com vírgula decimal. Fuso
  America/Fortaleza.
  - Mobile first: toda tela funciona em 375 px de largura antes do desktop.
  - Dinheiro sempre em centavos (bigint/number inteiro). Nunca float para
  valores.
  - Toda tabela com org_id e RLS. Nunca use a service_role no navegador.
  - Chamadas à Claude API e ao Asaas só em rotas de servidor; resposta de IA
  sempre validada com Zod.
  - Migrations em supabase/migrations, uma por mudança. Nunca edite migration
  já aplicada.
  - Testes com Vitest para regras de dinheiro, datas e faturas.
  - Ao terminar uma tarefa: rode lint, typecheck e testes, e liste o que mudou.



MVP
   1. Base do app. Prompt: "Crie o projeto Next.js conforme o AGENTS.md, com login por e-
       mail (magic link) do Supabase, layout com barra inferior no celular e menu lateral no
       desktop, e PWA instalável com Serwist. Telas vazias: Início, Lançamentos, Cartões,
       DRE, Configurações." Aceite: login funciona; o app instala na tela do celular; deploy na
       Vercel ok.
   2. Banco. Prompt: "Crie a migration inicial com o SQL da seção 7 da especificação, RLS
       em todas as tabelas com is_member, e um seed com a organização Aventure, as
       entidades e pessoas da seção 3, os meios de pagamento da tabela da seção 3 e o
       plano de categorias da seção 5. Gere os tipos TypeScript do Supabase." Aceite: um
       usuário de outra organização não enxerga nenhum dado (testar com dois usuários).
   3. Configurações. Prompt: "Telas de CRUD para entidades, pessoas, meios de
       pagamento (com fechamento e vencimento), categorias (com linha do DRE, natureza
       e rateio) e clientes." Aceite: alterar o vencimento de um cartão reflete nas faturas
       futuras.
   4. Lançamento rápido e parcelas. Prompt: "Implemente o lançamento rápido da seção 4
       (celular, item 2), sem IA por enquanto: chips de entidade e categoria escolhidos à mão,
       padrões pré-preenchidos. Compra parcelada cria um installment_group e uma
       transaction por parcela, com invoice_month e cash_date calculados pela função da
       seção 7. Escreva testes para o cálculo de fatura, incluindo o cartão Alexandre (fecha
       29, vence 6) e compra no dia do fechamento." Aceite: lançar em menos de 10
       segundos; testes passando.




                                                                                         Page 18 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




   5. Recorrências e contas do mês. Prompt: "Implemente recurring_rules e uma rota de
       cron protegida por CRON_SECRET que gera as transactions previstas do mês
       (idempotente). Tela 'Contas do mês' com status, e deslizar para marcar como pago
       informando o valor real." Aceite: rodar o cron duas vezes não duplica nada.
   6. Painel, fluxo e cartões. Prompt: "Crie as views v_cash_flow e v_card_invoices e as
       telas Início (celular), Painel e Fluxo de caixa (desktop, projeção de 6 meses) e Cartões
       (fatura por mês, parcelas 'n/N, faltam X', assinaturas ativas, divisão PJ/PF)." Aceite: os
       totais de nov/2026 batem com a planilha atual.
   7. Importação da planilha. Prompt: "Implemente a importação da seção 8.3: upload do
       .xlsx, mapa do layout com o Claude, tela de conferência do mapa, agrupamento de
       parcelas n/N sem duplicar, detecção de assinaturas e fixas, relatório e desfazer
       importação." Aceite: importar a planilha atual gera o MacBook como um único grupo
       de 12 parcelas.
   8. Classificação com IA e fila de revisão. Prompt: "Implemente a seção 8.1 (regras,
       histórico, Claude Haiku, limite de 0.80) no lançamento rápido e na importação, e a fila
       de revisão da seção 4 com opção de criar regra." Aceite: responder "Guará é Casa"
       uma vez faz o próximo Guará entrar sem pergunta.

Portão do MVP: usar por 30 dias, com todo gasto lançado e a fila zerada toda semana,
antes de iniciar a V2.


V2
   9. Voz e foto (seção 8.2), com a imagem no Storage privado.
 10. DRE completo e retiradas: view v_dre_monthly com rateio, tela DRE com drill-down e
       a tela "gastos da Aventure fora do PJ".
 11. Asaas: webhook de pagamentos (recebido ou confirmado) marcando a mensalidade
       do cliente como paga, idempotente pelo id do evento; sincronização diária de
       cobranças.
 12. Analista IA: job do dia 1, tela do relatório e chat com ferramentas de leitura (seção 8.4).
 13. Conferência de fatura: importar PDF ou CSV da fatura, cruzar com o que já foi lançado
       (valor, data ± 3 dias, descrição parecida) e mostrar só as diferenças.


10. Riscos, segurança e decisões em aberto
O maior risco não é técnico, é de hábito: se lançar der trabalho, o sistema fica vazio e volta-
se para a planilha. Por isso o lançamento rápido e a fila de revisão vêm antes de qualquer
gráfico.




                                                                                           Page 19 of 20
Caixa Aventure — Especificação do sistema de DRE e BPO financeiro




  Risco                                                             Como evitar

  Lançamentos esquecidos                                            Conferência de fatura (V2) e alerta semanal de
                                                                    "fila pendente"

  IA classificando errado em silêncio                               Limite de confiança de 0.80, fila de revisão e
                                                                    regras que aprendem com cada correção

  Parcelas duplicadas na importação                                 Agrupamento n/N e tela de conferência antes
                                                                    de gravar

  Vazamento de dados entre organizações                             RLS desde o MVP e teste automatizado com
  (V3)                                                              dois usuários

  Custo da IA crescer                                               Regras antes da IA, Haiku para classificar,
                                                                    analista só com dados agregados

  Escopo infinito                                                   Portão de 30 dias de uso antes da V2 e de 60
                                                                    dias antes da V3


Segurança e LGPD: dados financeiros são dados pessoais. Fotos de cupom ficam em
bucket privado com URL assinada de curta duração, número completo de cartão nunca é
guardado (só os últimos 4 dígitos), e o login exige e-mail confirmado. Na V3, cada cliente
BPO assina um termo de tratamento de dados, e a exclusão de uma organização apaga
tudo em cascata.

Decisões em aberto:

       Titular do cartão Itaú e banco do cartão de R$ 300 que vence dia 25
       Fechamento e vencimento do cartão da Toinha e do cartão Asaas PJ
       Alíquota efetiva do Simples e anexo (III ou V), a confirmar com a contadora
       Existe pró-labore formal, ou toda retirada é distribuição?
       Percentual de rateio da casa para a Aventure (internet, energia), se houver
       Contador Clara é mensal ou foi pontual em novembro?
       Se a API do Asaas expõe as transações do cartão PJ
       Nome definitivo do produto (provisório: Caixa Aventure)
       Na V3: preço do BPO e se o cliente usa o app ou só recebe relatórios




                                                                                                                  Page 20 of 20
