# Contrato entre o Worker (site-gtp) e a ponte da catraca

A ponte roda num PC do curso, na mesma rede da catraca. Ela **só faz requisições de saída**
para o Worker; o Worker nunca chama a ponte. Assim não é preciso abrir porta no roteador.

Todas as chamadas levam o cabeçalho:

```
Authorization: Bearer <TOKEN_PONTE>
```

`TOKEN_PONTE` é o segredo `CATRACA_TOKEN` do Worker (mín. 24 caracteres) e fica também no
`config.json` da ponte. Qualquer chamada sem ele, ou com outro valor, recebe `401`; sem o segredo
configurado no Worker, `503`.

**Implementação:** [app/catraca.ts](../app/catraca.ts), tabelas `catraca_acessos` e `catraca_status`
(migração `drizzle/0004_catraca.sql`), testes em `scripts/test-catraca.cjs`.

**Regra de liberação (real):** `students.status = 'ativo'`, pelo menos uma matrícula `ativa` e nenhuma
parcela `aberta` com vencimento há mais de `CATRACA_TOLERANCIA_DIAS` dias (padrão 5).
Código da catraca = `students.access_code` ou, se vazio, `students.legacy_code` (número do Secullum).
Visor: liberado = `LIBERADO` / nome; bloqueado = `VER NA RECEPCAO` em qualquer caso (o motivo não aparece
para quem está na fila). O campo `motivo` (`pagamento_atrasado`, `matricula_inativa`, `codigo_duplicado`) vai
só para o registro e para a área Catraca do painel. Dois alunos com o mesmo número ficam os dois bloqueados
até a secretaria corrigir. As seções abaixo com SQL "sugerido" foram
substituídas por essa implementação.

---

## 1. `GET /api/catraca/liberados`

A ponte chama a cada `intervaloSyncSegundos` (padrão 60 s) e guarda a resposta em disco.
Se a internet cair, a catraca continua decidindo pela última lista recebida.

Resposta `200`:

```json
{
  "geradoEm": "2026-11-16T14:03:00-03:00",
  "pessoas": [
    { "codigo": "1042", "nome": "MARIA SOUZA", "liberado": true,  "mensagem": "", "motivo": "" },
    { "codigo": "1043", "nome": "JOAO LIMA",   "liberado": false, "mensagem": "VER NA RECEPCAO", "motivo": "pagamento_atrasado" }
  ]
}
```

| Campo       | Significado |
|-------------|-------------|
| `codigo`    | Número que a catraca envia quando a pessoa passa o dedo/cartão. Só dígitos. É o mesmo número que a pessoa tem cadastrado na catraca (para quem já tem biometria, o número que o Secullum usava). |
| `nome`      | Aparece no visor ao liberar (a ponte corta em 16 caracteres, sem acento). |
| `liberado`  | O Worker é quem decide: matrícula ativa **e** pagamento em dia (ou qualquer outra regra). A ponte não sabe de pagamentos. |
| `mensagem`  | Texto no visor quando `liberado` é `false`. Máx. 16 caracteres; vazio = "ACESSO NEGADO". |

Mande **a lista inteira** sempre (inclusive os bloqueados). Quem não está na lista é tratado
como "NAO CADASTRADO".

Sugestão de SQL no D1 (ajuste aos nomes reais das tabelas):

```sql
SELECT a.codigo_catraca AS codigo,
       a.nome,
       CASE WHEN a.status = 'ativo' AND NOT EXISTS (
              SELECT 1 FROM mensalidades m
              WHERE m.aluno_id = a.id AND m.pago = 0
                AND m.vencimento < date('now', '-' || ?1 || ' days')
            ) THEN 1 ELSE 0 END AS liberado
FROM alunos a
WHERE a.codigo_catraca IS NOT NULL;
```

(`?1` = dias de tolerância depois do vencimento.)

---

## 2. `POST /api/catraca/eventos`

A ponte envia em lotes tudo o que aconteceu na catraca. Se o envio falhar, os eventos ficam
numa fila em disco e são reenviados depois; por isso o Worker precisa **ignorar repetidos**
pelo campo `id`.

Corpo:

```json
{
  "eventos": [
    {
      "id": "8f1c...-uuid",
      "codigo": "1042",
      "dataHora": "2026-11-16T07:42:11-03:00",
      "resultado": "liberado",
      "motivo": "",
      "equipamento": 1
    }
  ]
}
```

`resultado` pode ser:

| Valor          | Quando |
|----------------|--------|
| `liberado`     | A ponte mandou liberar. |
| `negado`       | A pessoa está bloqueada (`motivo` = mensagem mostrada). |
| `nao_cadastrado` | O código não está na lista. |
| `giro`         | A catraca confirmou que a pessoa passou. |
| `desistencia`  | Foi liberada mas não passou dentro do tempo. |

Resposta `200` com `{ "recebidos": <n> }`. Qualquer outro status = a ponte tenta de novo.

Tabela sugerida no D1:

```sql
CREATE TABLE IF NOT EXISTS acessos_catraca (
  id          TEXT PRIMARY KEY,           -- vem da ponte; garante que reenvio não duplica
  codigo      TEXT NOT NULL,
  data_hora   TEXT NOT NULL,
  resultado   TEXT NOT NULL,
  motivo      TEXT,
  equipamento INTEGER,
  recebido_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_acessos_codigo_data ON acessos_catraca (codigo, data_hora);
```

Inserir com `INSERT OR IGNORE`.

---

## 3. `POST /api/catraca/status` (opcional)

A cada sincronização a ponte avisa que está viva, para o painel mostrar "catraca online/offline":

```json
{ "versao": "0.1.0", "catracaConectada": true, "ultimaLista": "2026-11-16T14:03:00-03:00", "eventosPendentes": 0 }
```
