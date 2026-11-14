/**
 * Recebe os pedidos de aula teste enviados pelo site (POST /api/aula-teste)
 * e acrescenta uma linha na aba "Pedidos" desta planilha.
 *
 * Configuração (uma vez): Extensões > Apps Script > Configurações do projeto >
 * Propriedades do script > adicionar WEBHOOK_SECRET com a mesma chave usada em
 * SHEETS_WEBHOOK_SECRET na hospedagem do site. Passo a passo em LEIA-ME.md.
 */
var ABA = 'Pedidos';

function doPost(e) {
  try {
    var dados = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var chave = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (!chave || typeof dados.secret !== 'string' || !iguais(dados.secret, chave)) {
      return resposta({ ok: false, error: 'nao-autorizado' });
    }
    var trava = LockService.getScriptLock();
    trava.waitLock(10000);
    try {
      var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA);
      if (!aba) return resposta({ ok: false, error: 'aba-ausente' });
      var data = new Date(dados.data);
      aba.appendRow([
        isNaN(data.getTime()) ? new Date() : data,
        texto(dados.nome, 100),
        texto(dados.email, 254),
        texto(dados.telefone, 20),
        texto(dados.curso, 120),
        'Novo',
        ''
      ]);
    } finally {
      trava.releaseLock();
    }
    return resposta({ ok: true });
  } catch (erro) {
    return resposta({ ok: false, error: 'dados-invalidos' });
  }
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
