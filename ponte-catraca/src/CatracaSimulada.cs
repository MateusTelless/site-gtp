using System;
using System.Collections.Concurrent;
using System.Threading;

namespace PonteCatraca
{
    /// Catraca de mentira para testar sem o equipamento.
    /// No console: digite um código e Enter (= dedo/cartão), "g" (= girou) ou "d" (= desistiu).
    public class CatracaSimulada : ICatraca
    {
        readonly BlockingCollection<Leitura> entradas = new BlockingCollection<Leitura>();
        Thread leitor;

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
                    if (linha == "g") entradas.Add(new Leitura { tipo = TipoLeitura.Giro, origem = "simulada" });
                    else if (linha == "d") entradas.Add(new Leitura { tipo = TipoLeitura.Desistencia, origem = "simulada" });
                    else entradas.Add(new Leitura { tipo = TipoLeitura.Identificacao, codigo = linha, origem = "simulada" });
                }
            }) { IsBackground = true };
            leitor.Start();
            Console.WriteLine("[simulada] Digite um código + Enter, 'g' = girou, 'd' = desistiu.");
        }

        public void Desconectar() { }

        public Leitura Aguardar(int timeoutMs)
        {
            Leitura l;
            return entradas.TryTake(out l, timeoutMs) ? l : null;
        }

        public void Liberar(string linha1, string linha2, bool apenasEntrada)
        {
            Console.WriteLine("[visor] " + linha1 + " / " + linha2 + (apenasEntrada ? " (entrada)" : " (dois sentidos)"));
        }

        public void Negar(string linha1, string linha2)
        {
            Console.WriteLine("[visor] " + linha1 + " / " + linha2 + " (BLOQUEADO)");
        }
    }
}
