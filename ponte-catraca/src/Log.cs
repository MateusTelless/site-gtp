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
                Console.WriteLine(linha);
                if (pasta == null) return;
                try
                {
                    File.AppendAllText(Path.Combine(pasta, DateTime.Now.ToString("yyyy-MM-dd") + ".log"),
                        linha + Environment.NewLine);
                }
                catch { }
            }
        }
    }
}
