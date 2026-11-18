/**
 * Recebe do site o estado de cada matrícula e mantém uma linha por matrícula na aba
 * "Matrículas do site" da planilha do painel. A linha é encontrada pelo código da matrícula:
 * se já existe, é atualizada; se não, é criada no fim.
 *
 * As abas "Visão geral", "Agenda de matrículas" e "Contagem por turma" calculam tudo a partir desta aba.
 *
 * Configuração (uma vez): Extensões > Apps Script > Configurações do projeto > Propriedades do script >
 * adicionar WEBHOOK_SECRET com a mesma chave usada em MATRICULAS_SHEET_SECRET na hospedagem do site.
 * Passo a passo em LEIA-ME.md.
 */
var ABA = 'Matrículas do site';
var PRIMEIRA_LINHA = 4; // linhas 1 a 3: título, explicação e cabeçalho

function doPost(e) {
  try {
    var dados = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var chave = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (!chave || typeof dados.secret !== 'string' || !iguais(dados.secret, chave)) {
      return resposta({ ok: false, error: 'nao-autorizado' });
    }
    var codigo = String(dados.codigo || '');
    if (!/^[0-9A-F]{8}$/.test(codigo)) return resposta({ ok: false, error: 'codigo-invalido' });
    var trava = LockService.getScriptLock();
    trava.waitLock(10000);
    try {
      var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA);
      if (!aba) return resposta({ ok: false, error: 'aba-ausente' });
      var recebida = new Date(dados.recebida_em);
      if (isNaN(recebida.getTime())) recebida = new Date();
      var valores = [
        diaDeSaoPaulo(recebida),
        horaDeSaoPaulo(recebida),
        codigo,
        texto(dados.turma, 120),
        texto(dados.plano, 80),
        texto(dados.forma, 40),
        numero(dados.valor_cents) / 100,
        numero(dados.vagas),
        texto(dados.situacao, 40),
        /^\d{4}-\d{2}-\d{2}$/.test(String(dados.contrato_assinado_em || '')) ? dia(dados.contrato_assinado_em) : '',
        new Date()
      ];
      var linha = linhaDoCodigo(aba, codigo);
      if (linha) {
        aba.getRange(linha, 1, 1, valores.length).setValues([valores]);
      } else {
        aba.getRange(Math.max(aba.getLastRow() + 1, PRIMEIRA_LINHA), 1, 1, valores.length).setValues([valores]);
      }
      // A planilha de alunos é separada: se ela falhar, a linha do painel já foi gravada.
      var alunos = 'sem-dados';
      if (dados.alunos && typeof dados.alunos === 'object') {
        try { gravarAluno(codigo, dados.alunos); alunos = 'ok'; } catch (erroAlunos) { alunos = 'erro'; }
      }
    } finally {
      trava.releaseLock();
    }
    return resposta({ ok: true, alunos: alunos });
  } catch (erro) {
    return resposta({ ok: false, error: 'dados-invalidos' });
  }
}

/*
 * Planilha "Alunos 202X" da equipe: uma linha por aluno, no padrão que ela já usa.
 *   A quantidade (já numerada) · B Lexus (RA do aluno, que o site manda) · C NOMES · D DT MATRICULA · E ESCOLA (código da turma, ex.: BSET27)
 *   F TURMA (M, T, N ou ONLINE) · G OCORRENCIAS · H ATIVO · I TOTAL
 *   depois, um bloco por mês com o título "JULHO/26" na linha 1: DATA, VALOR, PAGO, FORMA.
 * O site só manda o bloco "alunos" depois do contrato assinado. A linha é achada pelo texto "Site CÓDIGO" na coluna G:
 * não apague esse texto. Na primeira vez a linha é preenchida inteira; depois, o script só muda a situação para DESLIGADO
 * quando a matrícula é cancelada e preenche PAGO e FORMA das parcelas pagas. O resto que a equipe editar fica como está.
 * Desligado enquanto ALUNOS_PLANILHA_ID não estiver nas propriedades do script.
 */
var ALUNOS_PRIMEIRA_LINHA = 3; // linha 1: meses; linha 2: cabeçalho
var COL = { quantidade: 1, ra: 2, nome: 3, matricula: 4, escola: 5, turma: 6, ocorrencias: 7, situacao: 8, total: 9 };
var MESES = { JANEIRO: 1, FEVEREIRO: 2, 'MARÇO': 3, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 };

function gravarAluno(codigo, a) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ALUNOS_PLANILHA_ID');
  if (!id) return;
  var aba = SpreadsheetApp.openById(id).getSheetByName(props.getProperty('ALUNOS_ABA') || 'Alunos 2027');
  if (!aba) return;
  var marca = 'Site ' + codigo;
  var blocos = blocosDeMes(aba);
  var meses = parcelasPorMes(a.parcelas);
  var foraDaPlanilha = Object.keys(meses).filter(function (m) { return !blocos[m]; });
  var linha = linhaDoAluno(aba, codigo);

  if (!linha) {
    linha = primeiraLinhaLivre(aba);
    var acima = linha > ALUNOS_PRIMEIRA_LINHA ? aba.getRange(linha - 1, COL.quantidade).getValue() : 0;
    if (aba.getRange(linha, COL.quantidade).getValue() === '' && typeof acima === 'number') aba.getRange(linha, COL.quantidade).setValue(acima + 1);
    var nota = marca + (foraDaPlanilha.length ? ' · parcelas sem coluna de mês: ' + foraDaPlanilha.map(mesCurto).join(', ') : '');
    aba.getRange(linha, COL.nome, 1, 7).setValues([[
      texto(a.nome, 120),
      /^\d{4}-\d{2}-\d{2}$/.test(String(a.matriculado_em || '')) ? dia(a.matriculado_em) : '',
      texto(a.escola, 20),
      texto(a.turma, 10),
      nota,
      a.situacao === 'DESLIGADO' ? 'DESLIGADO' : 'ATIVO',
      numero(a.total_cents) / 100
    ]]);
    aba.getRange(linha, COL.matricula).setNumberFormat('dd/mm/yyyy');
    if (/^\d{1,10}$/.test(String(a.ra || ''))) aba.getRange(linha, COL.ra).setValue(Number(a.ra));
    Object.keys(meses).forEach(function (m) {
      if (!blocos[m]) return;
      var p = meses[m];
      var celulas = aba.getRange(linha, blocos[m], 1, 4);
      celulas.setValues([[dia(p.vence), p.valor / 100, p.pago ? p.pago / 100 : '', texto(p.forma, 20)]]);
      aba.getRange(linha, blocos[m]).setNumberFormat('dd/mm');
    });
    return;
  }

  // Linha já lançada: só a saída do aluno e os pagamentos novos.
  if (a.situacao === 'DESLIGADO') aba.getRange(linha, COL.situacao).setValue('DESLIGADO');
  Object.keys(meses).forEach(function (m) {
    var p = meses[m];
    if (!blocos[m] || !p.pago) return;
    var pago = aba.getRange(linha, blocos[m] + 2);
    if (pago.getValue() !== '') return;
    pago.setValue(p.pago / 100);
    aba.getRange(linha, blocos[m] + 3).setValue(texto(p.forma, 20));
  });
}

// Coluna onde começa o bloco de cada mês, lida dos títulos da linha 1 ("JULHO/26" -> "2026-07").
function blocosDeMes(aba) {
  var titulos = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var blocos = {};
  titulos.forEach(function (t, i) {
    var m = String(t).trim().toUpperCase().match(/^([A-ZÇ]+)\s*\/\s*(\d{2})$/);
    if (m && MESES[m[1]]) blocos['20' + m[2] + '-' + ('0' + MESES[m[1]]).slice(-2)] = i + 1;
  });
  return blocos;
}

// Parcelas do mesmo mês (taxa de matrícula e mensalidade) ficam somadas no bloco do mês, com a data da primeira.
function parcelasPorMes(lista) {
  var meses = {};
  (Array.isArray(lista) ? lista : []).forEach(function (p) {
    if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.vence || ''))) return;
    var m = p.vence.slice(0, 7);
    if (!meses[m]) meses[m] = { vence: p.vence, valor: 0, pago: 0, forma: p.forma };
    meses[m].valor += numero(p.valor_cents);
    meses[m].pago += numero(p.pago_cents);
    if (p.pago_cents) meses[m].forma = p.forma;
  });
  return meses;
}

function mesCurto(m) { return m.slice(5, 7) + '/' + m.slice(2, 4); }

function linhaDoAluno(aba, codigo) {
  var ultima = aba.getLastRow();
  if (ultima < ALUNOS_PRIMEIRA_LINHA) return 0;
  var achado = aba.getRange(ALUNOS_PRIMEIRA_LINHA, COL.ocorrencias, ultima - ALUNOS_PRIMEIRA_LINHA + 1, 1)
    .createTextFinder('Site ' + codigo).findNext();
  return achado ? achado.getRow() : 0;
}

// Logo abaixo do último aluno com nome (a coluna A já vem numerada até o fim da planilha).
function primeiraLinhaLivre(aba) {
  var ultima = Math.max(aba.getLastRow(), ALUNOS_PRIMEIRA_LINHA);
  var nomes = aba.getRange(ALUNOS_PRIMEIRA_LINHA, COL.nome, ultima - ALUNOS_PRIMEIRA_LINHA + 1, 1).getValues();
  var linha = ALUNOS_PRIMEIRA_LINHA;
  for (var i = nomes.length - 1; i >= 0; i--) {
    if (String(nomes[i][0]).trim()) { linha = ALUNOS_PRIMEIRA_LINHA + i + 1; break; }
  }
  if (linha > aba.getMaxRows()) aba.insertRowAfter(aba.getMaxRows());
  return linha;
}

function linhaDoCodigo(aba, codigo) {
  var ultima = aba.getLastRow();
  if (ultima < PRIMEIRA_LINHA) return 0;
  var achado = aba.getRange(PRIMEIRA_LINHA, 3, ultima - PRIMEIRA_LINHA + 1, 1)
    .createTextFinder(codigo).matchEntireCell(true).findNext();
  return achado ? achado.getRow() : 0;
}

// Datas gravadas ao meio-dia UTC: caem no mesmo dia em qualquer fuso da planilha.
function dia(aaaaMmDd) {
  var p = String(aaaaMmDd).split('-');
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12));
}
function diaDeSaoPaulo(data) {
  return dia(Utilities.formatDate(data, 'America/Sao_Paulo', 'yyyy-MM-dd'));
}
// Hora como fração do dia, para a coluna formatada como hh:mm.
function horaDeSaoPaulo(data) {
  var p = Utilities.formatDate(data, 'America/Sao_Paulo', 'HH:mm').split(':');
  return (Number(p[0]) * 60 + Number(p[1])) / 1440;
}

function numero(valor) {
  var n = Number(valor);
  return isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

// Texto curto e sem fórmula: um valor começando com = + - @ viraria fórmula na planilha.
function texto(valor, maximo) {
  var t = String(valor == null ? '' : valor).replace(/[\r\n\t]+/g, ' ').trim().slice(0, maximo);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

// Compara as chaves sem sair no primeiro caractere diferente.
function iguais(a, b) {
  if (a.length !== b.length) return false;
  var diferenca = 0;
  for (var i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

function resposta(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
