using System;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading;

namespace PonteCatraca
{
    /// Junta tudo: atende a catraca numa thread e sincroniza com o Worker em outra.
    public class Ponte
    {
        readonly Config cfg;
        readonly ICatraca catraca;
        readonly CacheLiberados cache;
        readonly FilaEventos fila;
        readonly ApiWorker api;
        volatile bool rodando;
        volatile bool catracaConectada;
        Thread tCatraca, tSync;
        // Último código liberado em cada catraca, para ligar o giro à pessoa.
        readonly System.Collections.Generic.Dictionary<int, string> ultimoCodigoLiberado =
            new System.Collections.Generic.Dictionary<int, string>();

        public Ponte(Config cfg, ICatraca catraca, ApiWorker api)
        {
            this.cfg = cfg;
            this.catraca = catraca;
            this.api = api;
            cache = new CacheLiberados(cfg.pastaDados);
            fila = new FilaEventos(cfg.pastaDados);
        }

        public void Iniciar()
        {
            rodando = true;
            tCatraca = new Thread(LoopCatraca) { IsBackground = true, Name = "catraca" };
            tCatraca.Start();
            if (api != null)
            {
                tSync = new Thread(LoopSync) { IsBackground = true, Name = "sync" };
                tSync.Start();
            }
        }

        public void Parar()
        {
            rodando = false;
            if (tCatraca != null) tCatraca.Join(5000);
            if (tSync != null) tSync.Join(5000);
            try { catraca.Desconectar(); } catch { }
        }

        // ---------------- regra de acesso ----------------

        /// Visor igual ao do Secullum: "LIBERADO" + nome; bloqueio com uma frase só, sem expor o motivo.
        public const string MensagemBloqueio = "VER NA RECEPCAO";

        public Decisao Decidir(string codigo)
        {
            var norm = CacheLiberados.Normalizar(codigo);
            if (cfg.codigosSempreLiberados.Any(c => CacheLiberados.Normalizar(c) == norm))
                return new Decisao { liberar = true, resultado = "liberado", nome = "BEM-VINDO", motivo = "" };

            var p = cache.Buscar(codigo);
            if (p == null)
                return new Decisao { liberar = false, resultado = "nao_cadastrado", mensagem = MensagemBloqueio, motivo = "nao_cadastrado" };
            if (!p.liberado)
                return new Decisao
                {
                    liberar = false,
                    resultado = "negado",
                    mensagem = string.IsNullOrWhiteSpace(p.mensagem) ? MensagemBloqueio : p.mensagem,
                    motivo = p.motivo ?? ""
                };
            return new Decisao { liberar = true, resultado = "liberado", nome = p.nome ?? "", motivo = "" };
        }

        // ---------------- thread da catraca ----------------

        void LoopCatraca()
        {
            while (rodando)
            {
                try
                {
                    Log.Info("Conectando às catracas " + string.Join(", ", cfg.inners) + " (porta " + cfg.portaCatraca + ")...");
                    catraca.Conectar();
                    catracaConectada = true;

                    while (rodando)
                    {
                        var l = catraca.Aguardar(500);
                        if (l != null) Tratar(l);
                    }
                }
                catch (Exception e)
                {
                    Log.Erro("Catraca: " + e.Message);
                }
                catracaConectada = false;
                try { catraca.Desconectar(); } catch { }
                for (int i = 0; i < 50 && rodando; i++) Thread.Sleep(100);   // 5 s e tenta reconectar
            }
        }

        void Tratar(Leitura l)
        {
            if (l.tipo == TipoLeitura.Identificacao)
            {
                var d = Decidir(l.codigo);
                if (d.liberar)
                {
                    catraca.Liberar(l.equipamento, "LIBERADO", Visor(d.nome), !cfg.liberarSaidaSempre);
                    ultimoCodigoLiberado[l.equipamento] = l.codigo;
                }
                else
                {
                    catraca.Negar(l.equipamento, Visor(d.mensagem), "");
                }
                Log.Info("Catraca " + l.equipamento + ", " + l.origem + " " + l.codigo + " -> " + d.resultado
                    + (d.liberar ? " (" + d.nome + ")" : " (" + d.motivo + ")"));
                fila.Adicionar(Evento.Novo(CacheLiberados.Normalizar(l.codigo), d.resultado,
                    d.motivo, l.equipamento));
                return;
            }

            // Giro sem liberação antes = saída livre: registra sem código.
            string cod = l.codigo;
            if (string.IsNullOrEmpty(cod)) ultimoCodigoLiberado.TryGetValue(l.equipamento, out cod);
            var res = l.tipo == TipoLeitura.Giro ? "giro" : "desistencia";
            Log.Info("Catraca " + l.equipamento + ": " + res + " (" + (cod ?? "sem código") + ")");
            fila.Adicionar(Evento.Novo(CacheLiberados.Normalizar(cod ?? ""), res, "", l.equipamento));
            ultimoCodigoLiberado.Remove(l.equipamento);
        }

        /// Visor da Inner: 16 caracteres por linha, sem acento.
        public static string Visor(string texto)
        {
            if (texto == null) return "";
            var semAcento = new StringBuilder();
            foreach (var c in texto.Normalize(NormalizationForm.FormD))
                if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                    semAcento.Append(c);
            var s = semAcento.ToString().ToUpperInvariant();
            return s.Length > 16 ? s.Substring(0, 16) : s;
        }

        // ---------------- thread de sincronização ----------------

        void LoopSync()
        {
            while (rodando)
            {
                SincronizarUmaVez();
                for (int i = 0; i < cfg.intervaloSyncSegundos * 10 && rodando; i++) Thread.Sleep(100);
            }
        }

        public void SincronizarUmaVez()
        {
            try
            {
                string bruto;
                var lista = api.BaixarLiberados(out bruto);
                cache.Substituir(lista, bruto);
                Log.Info("Lista atualizada: " + lista.pessoas.Count + " pessoas.");
            }
            catch (Exception e)
            {
                Log.Aviso("Não consegui baixar a lista (seguindo com a local, de "
                    + (cache.AtualizadoEm.HasValue ? cache.AtualizadoEm.Value.ToString("dd/MM HH:mm") : "nunca")
                    + "): " + Raiz(e).Message);
            }

            try
            {
                while (true)
                {
                    var lote = fila.Pegar(200);
                    if (lote.Count == 0) break;
                    api.EnviarEventos(lote);
                    fila.Remover(lote);
                    Log.Info(lote.Count + " eventos enviados.");
                    if (lote.Count < 200) break;
                }
            }
            catch (Exception e)
            {
                Log.Aviso("Eventos ficam na fila para depois: " + Raiz(e).Message);
            }

            // Um status por catraca, para o painel mostrar cada uma.
            var pendentes = fila.Quantidade;
            foreach (var n in cfg.inners)
            {
                try
                {
                    api.EnviarStatus(new
                    {
                        equipamento = n,
                        versao = Programa.Versao,
                        catracaConectada = catracaConectada && catraca.Conectada(n),
                        ultimaLista = cache.GeradoEm,
                        eventosPendentes = pendentes
                    });
                }
                catch { }
            }
        }

        static Exception Raiz(Exception e)
        {
            while (e.InnerException != null) e = e.InnerException;
            return e;
        }
    }
}
