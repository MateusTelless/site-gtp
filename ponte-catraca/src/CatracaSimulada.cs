using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading;

namespace PonteCatraca
{
    /// Catracas de mentira para testar sem o equipamento.
    /// No console: "1042" = dedo na catraca 1; "2:1042" = dedo na catraca 2;
    /// "g" / "2:g" = girou; "d" / "2:d" = desistiu.
    public class CatracaSimulada : ICatraca
    {
        readonly BlockingCollection<Leitura> entradas = new BlockingCollection<Leitura>();
        readonly Config cfg;
        Thread leitor;

        public CatracaSimulada(Config cfg) { this.cfg = cfg; }

        public bool Conectada(int equipamento) { return cfg.inners.Contains(equipamento); }

        public void Conectar()
        {
            if (leitor != null) return;
            leitor = new Thread(() =>
            {
                string linha;
                while ((linha = Console.ReadLine()) != null)
                {
                    linha = linha.Trim();
                    if (linha.Length == 0) continue;
                    var equip = cfg.inners[0];
                    var p = linha.IndexOf(':');
                    if (p > 0) { int n; if (int.TryParse(linha.Substring(0, p), out n)) equip = n; linha = linha.Substring(p + 1); }
                    if (!cfg.inners.Contains(equip)) { Console.WriteLine("[simulada] catraca " + equip + " não existe"); continue; }
                    if (linha == "g") entradas.Add(new Leitura { tipo = TipoLeitura.Giro, equipamento = equip, origem = "simulada" });
                    else if (linha == "d") entradas.Add(new Leitura { tipo = TipoLeitura.Desistencia, equipamento = equip, origem = "simulada" });
                    else entradas.Add(new Leitura { tipo = TipoLeitura.Identificacao, equipamento = equip, codigo = linha, origem = "simulada" });
                }
            }) { IsBackground = true };
            leitor.Start();
            Console.WriteLine("[simulada] Catracas " + string.Join(", ", cfg.inners)
                + ". Digite um código (ou 2:código para a catraca 2), 'g' = girou, 'd' = desistiu.");
        }

        public void Desconectar() { }

        public Leitura Aguardar(int timeoutMs)
        {
            Leitura l;
            return entradas.TryTake(out l, timeoutMs) ? l : null;
        }

        public void Liberar(int equipamento, string linha1, string linha2, bool apenasEntrada)
        {
            Console.WriteLine("[visor catraca " + equipamento + "] " + linha1 + " / " + linha2 + (apenasEntrada ? " (entrada)" : " (dois sentidos)"));
        }

        public void Negar(int equipamento, string linha1, string linha2)
        {
            Console.WriteLine("[visor catraca " + equipamento + "] " + linha1 + " / " + linha2 + " (BLOQUEADO)");
        }
    }
}
