using System;
using System.IO;
using System.ServiceProcess;

namespace PonteCatraca
{
    public static class Programa
    {
        public const string Versao = "0.2.1";

        /// Uso:
        ///   PonteCatraca.exe              -> roda como serviço do Windows (instalado com instalar-servico.ps1)
        ///   PonteCatraca.exe --console    -> roda na janela, para testar
        ///   PonteCatraca.exe --console --sem-internet -> não fala com o Worker (só a lista local)
        public static int Main(string[] args)
        {
            try { Console.OutputEncoding = System.Text.Encoding.UTF8; } catch { }
            var pasta = AppDomain.CurrentDomain.BaseDirectory;
            Directory.SetCurrentDirectory(pasta);
            var console = Array.IndexOf(args, "--console") >= 0;
            var semInternet = Array.IndexOf(args, "--sem-internet") >= 0;

            if (!console)
            {
                ServiceBase.Run(new Servico());
                return 0;
            }

            var ponte = Montar(Path.Combine(pasta, "config.json"), semInternet);
            ponte.Iniciar();
            Console.WriteLine("Ponte rodando. Ctrl+C para sair.");
            var fim = new System.Threading.ManualResetEvent(false);
            Console.CancelKeyPress += (s, e) => { e.Cancel = true; fim.Set(); };
            fim.WaitOne();
            ponte.Parar();
            return 0;
        }

        public static Ponte Montar(string caminhoConfig, bool semInternet)
        {
            var cfg = Config.Carregar(caminhoConfig);
            Log.Iniciar(cfg.pastaDados);
            Log.Info("Ponte da catraca " + Versao + " iniciando (modo " + cfg.modoCatraca + ").");
            // Mostra qual config.json está valendo: no teste de 17/11/2026 editaram o arquivo de outra pasta.
            Log.Info("Configuração: " + Path.GetFullPath(caminhoConfig));
            Log.Info("  catracas " + string.Join(", ", cfg.inners)
                + "; invertidas: " + (cfg.catracasInvertidas.Count == 0 ? "nenhuma" : string.Join(", ", cfg.catracasInvertidas) + " (libera com " + cfg.liberarInvertidaCom + ")")
                + (cfg.liberarSaidaSempre ? "; ATENÇÃO: liberarSaidaSempre=true (dedo também na saída)" : "")
                + "; sempre liberados: " + (cfg.codigosSempreLiberados.Count == 0 ? "nenhum" : string.Join(", ", cfg.codigosSempreLiberados)) + ".");

            ICatraca catraca;
            if (cfg.modoCatraca == "simulada") catraca = new CatracaSimulada(cfg);
            else catraca = new CatracaEasyInner(cfg);

            var api = semInternet ? null : new ApiWorker(cfg);
            return new Ponte(cfg, catraca, api);
        }
    }

    public class Servico : ServiceBase
    {
        Ponte ponte;

        public Servico() { ServiceName = "PonteCatraca"; }

        protected override void OnStart(string[] args)
        {
            ponte = Programa.Montar(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json"), false);
            ponte.Iniciar();
        }

        protected override void OnStop()
        {
            if (ponte != null) ponte.Parar();
        }
    }
}
