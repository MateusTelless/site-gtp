/**
 * Recebe do site o PDF do contrato assinado pelas duas partes (aluno ou responsável e GETEPÊ)
 * e salva na pasta "Contratos assinados" do Drive, dentro de uma subpasta com o nome da turma.
 * A subpasta é criada na primeira vez que chega um contrato daquela turma.
 *
 * Se o mesmo contrato chegar de novo (mesmo código de matrícula na mesma turma), não duplica:
 * responde que já estava salvo.
 *
 * Configuração (uma vez): Configurações do projeto > Propriedades do script >
 *   WEBHOOK_SECRET = a mesma chave de CONTRATOS_DRIVE_SECRET na hospedagem do site
 *   PASTA_ID       = o código da pasta "Contratos assinados" (o final do endereço da pasta no Drive)
 * Passo a passo em LEIA-ME.md.
 */
var LIMITE_BYTES = 20 * 1024 * 1024;

function doPost(e) {
  try {
    var dados = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();
    var chave = props.getProperty('WEBHOOK_SECRET');
    if (!chave || typeof dados.secret !== 'string' || !iguais(dados.secret, chave)) {
      return resposta({ ok: false, error: 'nao-autorizado' });
    }
    var codigo = String(dados.codigo || '');
    if (!/^[0-9A-F]{8}$/.test(codigo)) return resposta({ ok: false, error: 'codigo-invalido' });
    var turma = nomeSeguro(dados.turma, 100) || 'Sem turma';
    var aluno = nomeSeguro(dados.aluno, 120) || 'Aluno';
    if (typeof dados.pdf !== 'string' || dados.pdf.length > LIMITE_BYTES * 1.4) return resposta({ ok: false, error: 'arquivo-invalido' });
    var bytes = Utilities.base64Decode(dados.pdf);
    // Só PDF: começa com %PDF.
    if (bytes.length < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
      return resposta({ ok: false, error: 'arquivo-invalido' });
    }
    if (typeof dados.sha256 === 'string' && dados.sha256 && hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)) !== dados.sha256) {
      return resposta({ ok: false, error: 'arquivo-corrompido' });
    }
    var pastaId = props.getProperty('PASTA_ID');
    if (!pastaId) return resposta({ ok: false, error: 'pasta-nao-configurada' });

    var trava = LockService.getScriptLock();
    trava.waitLock(20000);
    try {
      var raiz = DriveApp.getFolderById(pastaId);
      var pasta = subpasta(raiz, turma);
      var existentes = pasta.searchFiles("title contains '" + codigo + "' and trashed = false");
      if (existentes.hasNext()) return resposta({ ok: true, id: existentes.next().getId(), ja: true });
      var blob = Utilities.newBlob(bytes, 'application/pdf', aluno + ' - ' + codigo + '.pdf');
      var arquivo = pasta.createFile(blob);
      return resposta({ ok: true, id: arquivo.getId() });
    } finally {
      trava.releaseLock();
    }
  } catch (erro) {
    return resposta({ ok: false, error: 'falha' });
  }
}

function subpasta(raiz, nome) {
  var achou = raiz.getFoldersByName(nome);
  return achou.hasNext() ? achou.next() : raiz.createFolder(nome);
}

// Tira caracteres que atrapalham nome de arquivo e a busca do Drive.
function nomeSeguro(v, max) {
  return String(v || '').replace(/[\\\/:*?"<>|'\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function hex(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
