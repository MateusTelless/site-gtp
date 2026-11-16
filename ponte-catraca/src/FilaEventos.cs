using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;

namespace PonteCatraca
{
    /// Eventos esperando envio ao Worker. Cada evento é uma linha JSON num arquivo,
    /// para não perder nada se o PC desligar ou a internet cair.
    public class FilaEventos
    {
        readonly string arquivo;
        readonly object trava = new object();
        readonly JavaScriptSerializer json = new JavaScriptSerializer();

        public FilaEventos(string pastaDados)
        {
            arquivo = Path.Combine(pastaDados, "eventos-pendentes.jsonl");
        }

        public void Adicionar(Evento e)
        {
            lock (trava) File.AppendAllText(arquivo, json.Serialize(e) + Environment.NewLine);
        }

        public List<Evento> Pegar(int maximo)
        {
            lock (trava)
            {
                if (!File.Exists(arquivo)) return new List<Evento>();
                var lista = new List<Evento>();
                foreach (var linha in File.ReadAllLines(arquivo))
                {
                    if (lista.Count >= maximo) break;
                    if (string.IsNullOrWhiteSpace(linha)) continue;
                    try { lista.Add(json.Deserialize<Evento>(linha)); }
                    catch { Log.Aviso("Linha inválida na fila de eventos, descartada."); }
                }
                return lista;
            }
        }

        /// Remove da fila os eventos que o Worker confirmou.
        public void Remover(IEnumerable<Evento> enviados)
        {
            var ids = new HashSet<string>(enviados.Select(e => e.id));
            lock (trava)
            {
                if (!File.Exists(arquivo)) return;
                var restantes = File.ReadAllLines(arquivo).Where(l =>
                {
                    if (string.IsNullOrWhiteSpace(l)) return false;
                    try { return !ids.Contains(json.Deserialize<Evento>(l).id); }
                    catch { return false; }
                }).ToArray();
                File.WriteAllLines(arquivo, restantes);
            }
        }

        public int Quantidade
        {
            get
            {
                lock (trava)
                    return File.Exists(arquivo)
                        ? File.ReadAllLines(arquivo).Count(l => !string.IsNullOrWhiteSpace(l))
                        : 0;
            }
        }
    }
}
