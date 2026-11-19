using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;

namespace PonteCatraca
{
    /// Cópia de digitais entre as catracas (o que o Secullum fazia pelo banco dele).
    ///
    /// Cada catraca guarda as digitais no próprio módulo biométrico e identifica o dedo sozinha.
    /// Se alguém cadastra o dedo numa catraca só, a outra não reconhece. A cada poucos minutos a ponte
    /// lista os usuários de cada catraca e copia para a outra o que estiver faltando.
    ///
    /// Comandos e formato do template conferidos com o exemplo oficial (FrmBioController6xx.cs, SDK 6.0.2).
    /// Tudo roda na mesma thread que atende as catracas (a DLL não é thread-safe), em pedaços curtos
    /// (até ~1,5 s por rodada) e só quando nenhuma catraca está esperando giro.
    public partial class CatracaEasyInner
    {
        class TarefaDigital
        {
            public string usuario;     // número sem zeros à esquerda
            public int origem;         // catraca de onde lê
            public int destino;        // catraca para onde copia; 0 = só cópia de segurança
        }

        readonly Queue<TarefaDigital> tarefasDigitais = new Queue<TarefaDigital>();
        readonly Stopwatch desdeListagemDigitais = new Stopwatch();
        readonly Stopwatch desdeRodadaDigitais = Stopwatch.StartNew();
        readonly Stopwatch desdeUltimoDedo = new Stopwatch();
        bool listagemDigitaisFeita;
        // Usuários que aparecem na lista mas a catraca diz que não têm digital (retorno 132): não tenta de novo.
        readonly HashSet<string> semDigital = new HashSet<string>(StringComparer.Ordinal);
        int copiadasNaRodada, falhasNaRodada, backupsNaRodada;

        bool HorarioDeManutencao()
        {
            int h = DateTime.Now.Hour, ini = cfg.horaInicioManutencao, fim = cfg.horaFimManutencao;
            return ini <= fim ? (h >= ini && h < fim) : (h >= ini || h < fim);
        }

        string PastaBackupDigitais(int tipoBio)
        {
            return Path.Combine(cfg.pastaDados, "digitais", "tipo" + tipoBio);
        }

        void TalvezSincronizarDigitais()
        {
            if (!cfg.sincronizarDigitais) return;
            if (catracas.Any(e => !e.conectada || e.aguardandoGiro || e.tipoBio < 0)) return;
            // Nunca atrapalha quem está passando: espera 20 s sem nenhum dedo nas catracas (teste de 19/11/2026:
            // com blocos de 1,5 s a liberação chegava atrasada e a catraca travava antes do giro).
            if (desdeUltimoDedo.IsRunning && desdeUltimoDedo.Elapsed.TotalSeconds < 20) return;
            if (desdeRodadaDigitais.ElapsedMilliseconds < 1000) return;
            desdeRodadaDigitais.Restart();

            bool falouComBio = false;
            try
            {
                if (tarefasDigitais.Count == 0)
                {
                    var intervalo = listagemDigitaisFeita ? cfg.intervaloSyncDigitaisMinutos : 0;
                    if (listagemDigitaisFeita && desdeListagemDigitais.Elapsed.TotalMinutes < intervalo) return;
                    falouComBio = true;
                    MontarTarefasDigitais();
                    listagemDigitaisFeita = true;
                    desdeListagemDigitais.Restart();
                    return;   // copia nas próximas rodadas, para não segurar as catracas muito tempo de uma vez
                }

                falouComBio = true;
                var t = Stopwatch.StartNew();
                // Uma tarefa por vez (cada uma leva ~0,3 s); a próxima só depois de nova volta pelas catracas.
                while (tarefasDigitais.Count > 0 && t.ElapsedMilliseconds < 300)
                    ExecutarTarefaDigital(tarefasDigitais.Dequeue());

                if (tarefasDigitais.Count == 0 && (copiadasNaRodada + falhasNaRodada + backupsNaRodada) > 0)
                {
                    Log.Info("Digitais: " + copiadasNaRodada + " copiadas entre as catracas, " + falhasNaRodada + " com falha"
                        + (backupsNaRodada > 0 ? ", " + backupsNaRodada + " guardadas na cópia de segurança" : "") + ".");
                    copiadasNaRodada = falhasNaRodada = backupsNaRodada = 0;
                }
            }
            catch (Exception ex)
            {
                Log.Aviso("Digitais: " + ex.Message + " Tento de novo em " + cfg.intervaloSyncDigitaisMinutos + " min.");
                tarefasDigitais.Clear();
                listagemDigitaisFeita = true;
                desdeListagemDigitais.Restart();
            }
            finally
            {
                // Por garantia, volta as catracas para "esperando dedo" depois de mexer no módulo biométrico.
                if (falouComBio)
                    foreach (var e in catracas)
                        if (e.conectada && !e.aguardandoGiro) { try { Rearmar(e); } catch { } }
            }
        }

        void MontarTarefasDigitais()
        {
            var porCatraca = new Dictionary<int, HashSet<string>>();
            foreach (var e in catracas) porCatraca[e.numero] = ListarUsuariosBio(e);
            Log.Info("Digitais: " + string.Join(", ", catracas.Select(e => "catraca " + e.numero + " tem " + porCatraca[e.numero].Count)) + ".");

            var todos = new SortedSet<string>(porCatraca.Values.SelectMany(s => s), StringComparer.Ordinal);
            var faltando = new Dictionary<int, int>();
            foreach (var u in todos)
            {
                if (semDigital.Contains(u)) continue;
                foreach (var destino in catracas)
                {
                    if (porCatraca[destino.numero].Contains(u)) continue;
                    var origem = catracas.FirstOrDefault(o => o.tipoBio == destino.tipoBio && porCatraca[o.numero].Contains(u));
                    if (origem == null) continue;   // módulos diferentes: o template não serve de um para o outro
                    tarefasDigitais.Enqueue(new TarefaDigital { usuario = u, origem = origem.numero, destino = destino.numero });
                    faltando[destino.numero] = (faltando.ContainsKey(destino.numero) ? faltando[destino.numero] : 0) + 1;
                }
                if (cfg.backupDigitais && HorarioDeManutencao())
                {
                    var dono = catracas.First(o => porCatraca[o.numero].Contains(u));
                    if (!File.Exists(Path.Combine(PastaBackupDigitais(dono.tipoBio), u + ".bin")))
                        tarefasDigitais.Enqueue(new TarefaDigital { usuario = u, origem = dono.numero, destino = 0 });
                }
            }
            if (faltando.Count > 0)
                Log.Info("Digitais: vou copiar " + string.Join(", ", faltando.Select(kv => kv.Value + " para a catraca " + kv.Key)) + ".");
        }

        void ExecutarTarefaDigital(TarefaDigital t)
        {
            if (semDigital.Contains(t.usuario)) return;
            if (t.destino == 0 && !HorarioDeManutencao()) return;   // cópia de segurança fora de hora: deixa para a noite
            var origem = De(t.origem);
            var template = LerDigital(origem, t.usuario);
            if (template == null)
            {
                if (t.destino != 0 && !semDigital.Contains(t.usuario)) falhasNaRodada++;
                return;
            }
            if (cfg.backupDigitais) GuardarBackup(origem.tipoBio, t.usuario, template);
            if (t.destino == 0) { backupsNaRodada++; return; }

            var destino = De(t.destino);
            byte[] d1, d2;
            Separar(template, destino.tipoBio, out d1, out d2);
            var ret = EasyInner.EnviarDigitalUsuarioBio(destino.numero, destino.tipoBio, t.usuario, d1, d2);
            if (ret == EasyInner.RET_COMANDO_OK) ret = EasyInner.RespostaEnviarDigitalUsuarioBio(destino.numero);

            if (ret == EasyInner.RET_COMANDO_OK || ret == EasyInner.RET_BIO_USR_JA_CADASTRADO)
            {
                copiadasNaRodada++;
                Log.Info("Digital do usuário " + t.usuario + " copiada da catraca " + origem.numero + " para a " + destino.numero + ".");
            }
            else if (ret == EasyInner.RET_BIO_BASE_CHEIA)
            {
                falhasNaRodada++;
                tarefasDigitais.Clear();
                Log.Erro("Catraca " + destino.numero + ": memória de digitais cheia. Apague cadastros antigos no menu da catraca.");
            }
            else
            {
                falhasNaRodada++;
                Log.Aviso("Digital do usuário " + t.usuario + ": não consegui gravar na catraca " + destino.numero + " (retorno " + ret + ").");
            }
        }

        /// Lista os números de usuário com digital cadastrada na catraca (sem zeros à esquerda).
        HashSet<string> ListarUsuariosBio(Estado e)
        {
            var lista = new HashSet<string>(StringComparer.Ordinal);
            int qtdPacotes = 0, tamanho = 0;
            // Mesmo laço do exemplo oficial: pacote 0 até QtdPacotes.
            for (int pacote = 0; pacote <= qtdPacotes && pacote < 1000; pacote++)
            {
                var r = EasyInner.RequisitarListarUsuariosBio(e.numero, e.tipoBio, pacote);
                if (r == EasyInner.RET_COMANDO_OK) r = EasyInner.RespostaListarUsuariosBio(e.numero, ref qtdPacotes, ref tamanho);
                if (r != EasyInner.RET_COMANDO_OK)
                {
                    if (pacote > 0 && pacote >= qtdPacotes) break;   // o último pacote do laço pode não existir
                    throw new Exception("catraca " + e.numero + ": não consegui listar as digitais (pacote " + pacote + ", retorno " + r + ").");
                }
                if (tamanho <= 0) continue;
                var buf = new byte[tamanho];
                r = EasyInner.ReceberListaPacUsuariosBio(e.numero, buf, tamanho);
                if (r != EasyInner.RET_COMANDO_OK)
                    throw new Exception("catraca " + e.numero + ": falha ao receber a lista de digitais (retorno " + r + ").");
                for (int i = 4; i + 11 <= buf.Length; i += 11)
                {
                    var u = NormalizarUsuario(BcdParaTexto(buf, i, 11));
                    if (u.Length > 0) lista.Add(u);
                }
            }
            return lista;
        }

        byte[] LerDigital(Estado e, string usuario)
        {
            int tamanho = 0;
            var r = EasyInner.RequisitarUsuarioCadastradoBio(e.numero, e.tipoBio, usuario);
            if (r == EasyInner.RET_COMANDO_OK) r = EasyInner.RespostaUsuarioCadastradoBio(e.numero, ref tamanho);
            if (r == EasyInner.RET_BIO_USR_NAO_CADASTRADO)
            {
                // Cadastro sem digital (ex.: usuário criado só com número). Não é erro; anota e não tenta mais.
                semDigital.Add(usuario);
                Log.Info("Usuário " + usuario + " está na catraca " + e.numero + " sem digital; não há o que copiar.");
                return null;
            }
            if (r != EasyInner.RET_COMANDO_OK || tamanho <= 0)
            {
                Log.Aviso("Digital do usuário " + usuario + ": não consegui ler da catraca " + e.numero + " (retorno " + r + ").");
                return null;
            }
            var buf = new byte[tamanho];
            r = EasyInner.ReceberDigitalUsuarioBio(e.numero, buf, tamanho);
            if (r != EasyInner.RET_COMANDO_OK)
            {
                Log.Aviso("Digital do usuário " + usuario + ": falha ao receber da catraca " + e.numero + " (retorno " + r + ").");
                return null;
            }
            return buf;
        }

        void GuardarBackup(int tipoBio, string usuario, byte[] template)
        {
            try
            {
                var pasta = PastaBackupDigitais(tipoBio);
                Directory.CreateDirectory(pasta);
                File.WriteAllBytes(Path.Combine(pasta, usuario + ".bin"), template);
            }
            catch (Exception ex) { Log.Aviso("Cópia de segurança da digital " + usuario + ": " + ex.Message); }
        }

        /// O template recebido tem um cabeçalho e as duas digitais em sequência (offsets do exemplo oficial):
        /// LN: 68 + 404 + 404; LC: 68 + 502 + 502; LM: 17 + 256 + 256. A segunda digital pode não existir.
        internal static void Separar(byte[] buf, int tipoBio, out byte[] d1, out byte[] d2)
        {
            int inicio = tipoBio == 2 ? 17 : 68;
            int tam = tipoBio == 0 ? 404 : tipoBio == 1 ? 502 : 256;
            if (buf.Length < inicio + tam) throw new Exception("template curto demais (" + buf.Length + " bytes).");
            d1 = new byte[tam];
            Array.Copy(buf, inicio, d1, 0, tam);
            d2 = null;
            if (buf.Length >= inicio + 2 * tam)
            {
                var t2 = new byte[tam];
                Array.Copy(buf, inicio + tam, t2, 0, tam);
                if (t2.Any(b => b != 0)) d2 = t2;
            }
        }

        /// Conversão do número do usuário na lista (Utils.BCDToDecimalSub do exemplo oficial).
        internal static string BcdParaTexto(byte[] buf, int inicio, int tamanho)
        {
            var sb = new StringBuilder();
            for (int i = inicio; i < inicio + tamanho; i++)
                if (buf[i] != 0) sb.Append(((byte)(buf[i] - 1)).ToString("x2"));
            return sb.ToString();
        }

        internal static string NormalizarUsuario(string u)
        {
            u = (u ?? "").Trim();
            if (u.Length == 0 || !u.All(char.IsDigit)) return "";   // número estranho: melhor pular do que copiar errado
            return u.TrimStart('0');
        }
    }
}
