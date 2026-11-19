using System;
using System.IO;

namespace PonteCatraca
{
    public static class Log
    {
        static readonly object trava = new object();
        static string pasta;

        public static void Iniciar(string pastaDados)
        {
            pasta = Path.Combine(pastaDados, "logs");
            Directory.CreateDirectory(pasta);
        }

        public static void Info(string msg) { Escrever("INFO", msg); }
        public static void Aviso(string msg) { Escrever("AVISO", msg); }
        public static void Erro(string msg) { Escrever("ERRO", msg); }

        static void Escrever(string nivel, string msg)
        {
            var linha = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " [" + nivel + "] " + msg;
            lock (trava)
            {
                // Arquivo primeiro: se a janela travar (alguém clicou nela e ela ficou em "Selecionar"),
                // o log em disco já tem a linha. No teste de 19/11/2026 o log parou por causa disso.
                if (pasta != null)
                {
                    try
                    {
                        File.AppendAllText(Path.Combine(pasta, DateTime.Now.ToString("yyyy-MM-dd") + ".log"),
                            linha + Environment.NewLine);
                    }
                    catch { }
                }
                Console.WriteLine(linha);
            }
        }
    }
}
