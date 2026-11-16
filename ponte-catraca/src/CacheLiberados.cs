using System;
using System.Collections.Generic;
using System.IO;
using System.Web.Script.Serialization;

namespace PonteCatraca
{
    /// Última lista recebida do Worker, em memória e em disco.
    /// A catraca decide por aqui; a internet só serve para atualizar.
    public class CacheLiberados
    {
        readonly string arquivo;
        readonly object trava = new object();
        Dictionary<string, Pessoa> porCodigo = new Dictionary<string, Pessoa>();
        public string GeradoEm { get; private set; }
        public DateTime? AtualizadoEm { get; private set; }

        public CacheLiberados(string pastaDados)
        {
            arquivo = Path.Combine(pastaDados, "liberados.json");
            if (File.Exists(arquivo))
            {
                try
                {
                    var lista = new JavaScriptSerializer { MaxJsonLength = int.MaxValue }
                        .Deserialize<ListaLiberados>(File.ReadAllText(arquivo));
                    Aplicar(lista);
                    AtualizadoEm = File.GetLastWriteTime(arquivo);
                    Log.Info("Lista local carregada: " + porCodigo.Count + " pessoas (gerada em " + GeradoEm + ").");
                }
                catch (Exception e)
                {
                    Log.Erro("Lista local corrompida, ignorando: " + e.Message);
                }
            }
            else
            {
                Log.Aviso("Ainda não há lista local. Todos serão negados até a primeira sincronização.");
            }
        }

        public void Substituir(ListaLiberados lista, string jsonOriginal)
        {
            Aplicar(lista);
            var tmp = arquivo + ".tmp";
            File.WriteAllText(tmp, jsonOriginal);
            if (File.Exists(arquivo)) File.Replace(tmp, arquivo, null);
            else File.Move(tmp, arquivo);
            AtualizadoEm = DateTime.Now;
        }

        void Aplicar(ListaLiberados lista)
        {
            var novo = new Dictionary<string, Pessoa>();
            if (lista != null && lista.pessoas != null)
                foreach (var p in lista.pessoas)
                    if (p != null && !string.IsNullOrEmpty(p.codigo))
                        novo[Normalizar(p.codigo)] = p;
            lock (trava)
            {
                porCodigo = novo;
                GeradoEm = lista == null ? null : lista.geradoEm;
            }
        }

        public Pessoa Buscar(string codigo)
        {
            Pessoa p;
            lock (trava) return porCodigo.TryGetValue(Normalizar(codigo), out p) ? p : null;
        }

        public int Quantidade { get { lock (trava) return porCodigo.Count; } }

        /// A catraca manda o número com zeros à esquerda ("00000000001042"); o banco guarda "1042".
        public static string Normalizar(string codigo)
        {
            if (codigo == null || codigo.Trim().Length == 0) return "";
            var s = codigo.Trim().TrimStart('0');
            return s.Length == 0 ? "0" : s;
        }
    }
}
